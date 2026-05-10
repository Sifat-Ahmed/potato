import * as vscode from 'vscode';
import { LlmClient } from './llmClient';
import { AgentConfig, DelegationTask, EndpointConfig, OrchestratorRunUpdate } from './types';
import { asErrorMessage, parseJsonObject } from './utils';

interface DelegationPlan {
  tasks?: DelegationTask[];
}

export class OrchestratorRuntime {
  constructor(
    private readonly llmClient: LlmClient,
    private readonly emit: (update: OrchestratorRunUpdate) => void
  ) {}

  async run(taskText: string, endpoints: EndpointConfig[], agents: AgentConfig[]): Promise<void> {
    const enabledAgents = agents.filter(agent => agent.enabled);
    const manager = enabledAgents.find(agent => agent.role === 'manager') ?? enabledAgents[0];

    if (!manager) {
      this.emit({ kind: 'error', message: 'Create at least one enabled agent before running a task.' });
      return;
    }

    if (!manager.endpointId || !manager.model) {
      this.emit({ kind: 'error', message: `Assign an endpoint and model to ${manager.name} before running a task.` });
      return;
    }

    const endpointMap = new Map(endpoints.map(endpoint => [endpoint.id, endpoint]));
    const managerEndpoint = endpointMap.get(manager.endpointId);
    if (!managerEndpoint) {
      this.emit({ kind: 'error', message: `Endpoint for ${manager.name} was not found.` });
      return;
    }

    try {
      this.emit({ kind: 'status', message: `${manager.name} is creating a plan.` });

      const autoDelegate = vscode.workspace.getConfiguration('orchestrator').get<boolean>('autoDelegate', true);
      const delegationTasks = autoDelegate
        ? await this.createDelegationPlan(taskText, manager, managerEndpoint, enabledAgents)
        : [];

      if (delegationTasks.length === 0) {
        this.emit({ kind: 'status', message: `${manager.name} is answering directly.` });
        const result = await this.llmClient.callAgent(managerEndpoint, {
          agent: manager,
          input: taskText
        });
        this.emit({ kind: 'final', message: result.text, result });
        return;
      }

      this.emit({
        kind: 'plan',
        message: delegationTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
      });

      const agentResults = await this.runDelegatedTasks(delegationTasks, enabledAgents, endpointMap, taskText);
      const synthesis = await this.synthesize(taskText, manager, managerEndpoint, delegationTasks, agentResults);

      this.emit({ kind: 'final', message: synthesis.text, result: synthesis });
    } catch (error) {
      this.emit({ kind: 'error', message: asErrorMessage(error) });
    }
  }

  private async createDelegationPlan(
    taskText: string,
    manager: AgentConfig,
    endpoint: EndpointConfig,
    agents: AgentConfig[]
  ): Promise<DelegationTask[]> {
    const availableAgents = agents
      .filter(agent => agent.id !== manager.id && agent.endpointId && agent.model)
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
      ].join('\n')
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
    originalTask: string
  ) {
    const agentMap = new Map(agents.map(agent => [agent.id, agent]));
    const calls = tasks.map(async task => {
      const agent = agentMap.get(task.agentId);
      const endpoint = agent?.endpointId ? endpointMap.get(agent.endpointId) : undefined;

      if (!agent || !endpoint) {
        throw new Error(`Agent for task "${task.title}" is not configured.`);
      }

      this.emit({ kind: 'status', message: `${agent.name} is working on ${task.title}.`, task });
      const result = await this.llmClient.callAgent(endpoint, {
        agent,
        input: [
          `Original user task:\n${originalTask}`,
          '',
          `Assigned task:\n${task.instructions}`
        ].join('\n')
      });
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
    results: Awaited<ReturnType<OrchestratorRuntime['runDelegatedTasks']>>
  ) {
    return this.llmClient.callAgent(endpoint, {
      agent: manager,
      input: [
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
      ].join('\n')
    });
  }
}
