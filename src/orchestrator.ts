import * as vscode from 'vscode';
import { extractPendingActions, extractToolCalls } from './actionParser';
import { createEffectiveAgentConfig, LlmClient } from './llmClient';
import { ToolRunner } from './toolRunner';
import { AgentCallResult, AgentConfig, DelegationTask, EndpointConfig, OrchestratorRunUpdate, PendingAction } from './types';
import { asErrorMessage, parseJsonObject } from './utils';

interface DelegationPlan {
  tasks?: DelegationTask[];
}

export class OrchestratorRuntime {
  constructor(
    private readonly llmClient: LlmClient,
    private readonly emit: (update: OrchestratorRunUpdate) => void,
    private readonly toolRunner: ToolRunner,
    private readonly recordActions: (actions: PendingAction[]) => Promise<void>
  ) {}

  async run(taskText: string, endpoints: EndpointConfig[], agents: AgentConfig[], abortSignal?: AbortSignal): Promise<void> {
    const enabledAgents = agents.filter(agent => agent.enabled);
    const manager = enabledAgents.find(agent => agent.role === 'manager') ?? enabledAgents[0];

    if (!manager) {
      this.emit({ kind: 'error', message: 'Create at least one enabled agent before running a task.' });
      return;
    }

    if (!manager.endpointId) {
      this.emit({ kind: 'error', message: `Assign an endpoint to ${manager.name} before running a task.` });
      return;
    }

    const endpointMap = new Map(endpoints.map(endpoint => [endpoint.id, endpoint]));
    const managerEndpoint = endpointMap.get(manager.endpointId);
    if (!managerEndpoint) {
      this.emit({ kind: 'error', message: `Endpoint for ${manager.name} was not found.` });
      return;
    }
    if (!createEffectiveAgentConfig(managerEndpoint, manager).model) {
      this.emit({ kind: 'error', message: `Set a model/deployment on endpoint ${managerEndpoint.name} before running ${manager.name}.` });
      return;
    }

    try {
      this.emit({ kind: 'status', message: `${manager.name} is creating a plan.` });

      const autoDelegate = vscode.workspace.getConfiguration('orchestrator').get<boolean>('autoDelegate', true);
      const delegationTasks = autoDelegate
        ? await this.createDelegationPlan(taskText, manager, managerEndpoint, enabledAgents, endpointMap, abortSignal)
        : [];

      if (delegationTasks.length === 0) {
        this.emit({ kind: 'status', message: `${manager.name} is answering directly.` });
        const result = await this.callAgentWithTools(managerEndpoint, manager, taskText, abortSignal);
        this.emit({ kind: 'final', message: result.text, result });
        return;
      }

      this.emit({
        kind: 'plan',
        message: delegationTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
      });

      const agentResults = await this.runDelegatedTasks(delegationTasks, enabledAgents, endpointMap, taskText, abortSignal);
      const synthesis = await this.synthesize(taskText, manager, managerEndpoint, delegationTasks, agentResults, abortSignal);

      this.emit({ kind: 'final', message: synthesis.text, result: synthesis });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.emit({ kind: 'cancelled', message: 'Run cancelled.' });
        return;
      }
      this.emit({ kind: 'error', message: asErrorMessage(error) });
    }
  }

  private async createDelegationPlan(
    taskText: string,
    manager: AgentConfig,
    endpoint: EndpointConfig,
    agents: AgentConfig[],
    endpointMap: Map<string, EndpointConfig>,
    abortSignal?: AbortSignal
  ): Promise<DelegationTask[]> {
    const availableAgents = agents
      .filter(agent => {
        const agentEndpoint = agent.endpointId ? endpointMap.get(agent.endpointId) : undefined;
        return agent.id !== manager.id && agentEndpoint && createEffectiveAgentConfig(agentEndpoint, agent).model;
      })
      .map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        systemPrompt: agent.systemPrompt
      }));

    if (availableAgents.length === 0) {
      return [];
    }

    const result = await this.llmClient.callAgent(endpoint, {
      agent: manager,
      input: [
        'Create a delegation plan for this user task.',
        'Return only valid JSON using this schema:',
        '{"tasks":[{"agentId":"agent id","title":"short title","instructions":"specific instructions"}]}',
        'Use only agent IDs from the available list. Keep the plan to the minimum useful tasks.',
        '',
        `Available agents:\n${JSON.stringify(availableAgents, null, 2)}`,
        '',
        `User task:\n${taskText}`
      ].join('\n'),
      abortSignal
    });

    const plan = parseJsonObject<DelegationPlan>(result.text);
    if (!plan?.tasks?.length) {
      return [];
    }

    const availableIds = new Set(availableAgents.map(agent => agent.id));
    const maxParallelAgents = vscode.workspace.getConfiguration('orchestrator').get<number>('maxParallelAgents', 4);

    return plan.tasks
      .filter(task => availableIds.has(task.agentId) && task.title && task.instructions)
      .slice(0, Math.max(1, maxParallelAgents));
  }

  private async runDelegatedTasks(
    tasks: DelegationTask[],
    agents: AgentConfig[],
    endpointMap: Map<string, EndpointConfig>,
    originalTask: string,
    abortSignal?: AbortSignal
  ) {
    const agentMap = new Map(agents.map(agent => [agent.id, agent]));
    const calls = tasks.map(async task => {
      const agent = agentMap.get(task.agentId);
      const endpoint = agent?.endpointId ? endpointMap.get(agent.endpointId) : undefined;

      if (!agent || !endpoint) {
        throw new Error(`Agent for task "${task.title}" is not configured.`);
      }

      this.emit({ kind: 'status', message: `${agent.name} is working on ${task.title}.`, task });
      const result = await this.callAgentWithTools(endpoint, agent, [
          `Original user task:\n${originalTask}`,
          '',
          `Assigned task:\n${task.instructions}`
        ].join('\n'), abortSignal);
      this.emit({ kind: 'agent-result', message: result.text, task, result });
      return result;
    });

    return Promise.all(calls);
  }

  private async synthesize(
    taskText: string,
    manager: AgentConfig,
    endpoint: EndpointConfig,
    tasks: DelegationTask[],
    results: Awaited<ReturnType<OrchestratorRuntime['runDelegatedTasks']>>,
    abortSignal?: AbortSignal
  ) {
    return this.callAgentWithTools(endpoint, manager, [
        'Synthesize the final response for the user.',
        'Be direct, preserve important caveats, and call out any task that failed or lacks evidence.',
        '',
        `Original user task:\n${taskText}`,
        '',
        `Delegation plan:\n${JSON.stringify(tasks, null, 2)}`,
        '',
        `Agent results:\n${JSON.stringify(results.map(result => ({
          agentName: result.agentName,
          text: result.text
        })), null, 2)}`
      ].join('\n'), abortSignal);
  }

  private async callAgentWithTools(
    endpoint: EndpointConfig,
    agent: AgentConfig,
    input: string,
    abortSignal?: AbortSignal
  ): Promise<AgentCallResult> {
    const firstResult = await this.llmClient.callAgent(endpoint, {
      agent,
      input: `${input}\n\n${toolProtocolInstructions()}`,
      abortSignal,
      onToken: token => this.emit({ kind: 'token', message: token })
    });

    const toolCalls = extractToolCalls(firstResult.text);
    let result = firstResult;

    if (toolCalls.length > 0) {
      this.emit({ kind: 'status', message: `${agent.name} requested ${toolCalls.length} local tool call(s).` });
      const toolResults = await Promise.all(toolCalls.map(call => this.toolRunner.run(call, agent)));
      const toolActions = toolResults.flatMap(result => result.actions ?? []);
      if (toolActions.length > 0) {
        await this.recordActions(toolActions);
        this.emit({
          kind: 'action-proposal',
          message: `${agent.name} queued ${toolActions.length} approval action(s) from local tools.`,
          actions: toolActions
        });
      }
      this.emit({
        kind: 'tool-result',
        message: toolResults.map(item => `${item.name}: ${item.ok ? 'ok' : 'failed'}\n${item.content}`).join('\n\n')
      });

      result = await this.llmClient.callAgent(endpoint, {
        agent,
        input: [
          input,
          '',
          'Local tool results:',
          JSON.stringify(toolResults.map(({ actions, ...toolResult }) => toolResult), null, 2),
          '',
          'Now produce the final response. If file writes, file deletes, or terminal commands are needed, return the approved action proposal JSON schema from the tool instructions.'
        ].join('\n'),
        abortSignal,
        onToken: token => this.emit({ kind: 'token', message: token })
      });
    }

    const actions = extractPendingActions(result.text, agent);
    if (actions.length > 0) {
      await this.recordActions(actions);
      this.emit({
        kind: 'action-proposal',
        message: `${agent.name} proposed ${actions.length} action(s) for approval.`,
        actions
      });
    }

    return result;
  }
}

function toolProtocolInstructions(): string {
  return [
    'Local tools are available through a provider-neutral JSON protocol.',
    'To use tools, reply only with valid JSON: {"toolCalls":[{"name":"web_search","arguments":{"query":"text"}},{"name":"fetch_url","arguments":{"url":"https://example.com"}},{"name":"list_files","arguments":{"glob":"src/**/*.ts"}},{"name":"read_file","arguments":{"path":"src/file.ts","maxBytes":12000}},{"name":"search_workspace","arguments":{"query":"needle"}},{"name":"write_file","arguments":{"path":"relative/path.ts","content":"full file content","description":"why"}},{"name":"delete_file","arguments":{"path":"relative/path.ts","description":"why"}}]}',
    'Do not pretend a tool ran. Request a tool call first, then wait for tool results.',
    'To propose workspace changes instead of tool calls, reply with valid JSON: {"fileEdits":[{"path":"relative/path","content":"full file content","description":"why"}],"fileDeletes":[{"path":"relative/path","description":"why"}],"terminalCommands":[{"command":"npm test","cwd":"optional/path","description":"why"}]}',
    'File writes, file deletes, and terminal commands require user approval before execution.'
  ].join('\n');
}
