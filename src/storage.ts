import * as vscode from 'vscode';
import { AgentConfig, EndpointConfig, PendingAction, PersistedState, PublicState, RunHistoryEntry } from './types';
import { createStarterAgents } from './starterData';
import { createId } from './utils';

const STATE_KEY = 'orchestrator.state.v1';
const SECRET_PREFIX = 'orchestrator.endpointKey.';
const LOCAL_KEY_FILE = 'endpoint-keys.local.json';

export class OrchestratorStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getState(): Promise<PersistedState> {
    const state = this.context.globalState.get<PersistedState>(STATE_KEY);
    if (state) {
      const normalized = normalizeState({
        endpoints: Array.isArray(state.endpoints) ? state.endpoints : [],
        agents: Array.isArray(state.agents) ? state.agents : [],
        pendingActions: Array.isArray(state.pendingActions) ? state.pendingActions : [],
        runHistory: Array.isArray(state.runHistory) ? state.runHistory : []
      });
      if (normalized.changed) {
        await this.saveState(normalized.state);
      }
      return normalized.state;
    }

    const starterState: PersistedState = {
      endpoints: [],
      agents: createStarterAgents(),
      pendingActions: [],
      runHistory: []
    };
    await this.saveState(starterState);
    return starterState;
  }

  async getPublicState(): Promise<PublicState> {
    const state = await this.getState();
    const endpoints = await Promise.all(
      state.endpoints.map(async endpoint => ({
        ...endpoint,
        hasApiKey: Boolean(await this.getApiKey(endpoint.id))
      }))
    );

    return {
      endpoints,
      agents: state.agents,
      pendingActions: state.pendingActions ?? [],
      runHistory: state.runHistory ?? [],
      conversations: []
    };
  }

  async saveEndpoint(endpoint: Omit<EndpointConfig, 'createdAt' | 'updatedAt'>, apiKey?: string): Promise<void> {
    const state = await this.getState();
    const now = Date.now();
    const existing = state.endpoints.find(item => item.id === endpoint.id);
    const nextEndpoint: EndpointConfig = {
      ...endpoint,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    const nextEndpoints = existing
      ? state.endpoints.map(item => (item.id === endpoint.id ? nextEndpoint : item))
      : [...state.endpoints, nextEndpoint];

    await this.saveState({ ...state, endpoints: nextEndpoints });

    if (apiKey !== undefined) {
      const trimmed = apiKey.trim();
      if (trimmed.length > 0) {
        await this.context.secrets.store(this.secretKey(endpoint.id), trimmed);
        await this.saveLocalApiKey(endpoint.id, trimmed);
      }
    }
  }

  async deleteEndpoint(endpointId: string): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      endpoints: state.endpoints.filter(endpoint => endpoint.id !== endpointId),
      agents: state.agents.map(agent =>
        agent.endpointId === endpointId ? { ...agent, endpointId: undefined, updatedAt: Date.now() } : agent
      )
    });
    await this.context.secrets.delete(this.secretKey(endpointId));
    await this.deleteLocalApiKey(endpointId);
  }

  async saveAgent(agent: Omit<AgentConfig, 'createdAt' | 'updatedAt'>): Promise<void> {
    const state = await this.getState();
    const now = Date.now();
    const existing = state.agents.find(item => item.id === agent.id);
    const nextAgent: AgentConfig = {
      ...agent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.saveState({
      ...state,
      agents: existing
        ? state.agents.map(item => (item.id === agent.id ? nextAgent : item))
        : [...state.agents, nextAgent]
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      agents: state.agents.filter(agent => agent.id !== agentId)
    });
  }

  async resetStarterAgents(): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      agents: createStarterAgents()
    });
  }

  async addPendingActions(actions: PendingAction[]): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    const state = await this.getState();
    await this.saveState({
      ...state,
      pendingActions: [...actions, ...(state.pendingActions ?? [])].slice(0, 100)
    });
  }

  async updatePendingAction(actionId: string, patch: Partial<PendingAction>): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      pendingActions: (state.pendingActions ?? []).map(action =>
        action.id === actionId
          ? { ...action, ...patch, updatedAt: Date.now() }
          : action
      )
    });
  }

  async getPendingAction(actionId: string): Promise<PendingAction | undefined> {
    const state = await this.getState();
    return (state.pendingActions ?? []).find(action => action.id === actionId);
  }

  async addRunHistory(entry: RunHistoryEntry): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      runHistory: [entry, ...(state.runHistory ?? [])].slice(0, 50)
    });
  }

  async exportState(): Promise<PersistedState> {
    const state = await this.getState();
    return {
      endpoints: state.endpoints,
      agents: state.agents,
      pendingActions: state.pendingActions ?? [],
      runHistory: state.runHistory ?? []
    };
  }

  async importState(imported: Partial<PersistedState>): Promise<void> {
    const state = await this.getState();
    const normalized = normalizeState({
      endpoints: Array.isArray(imported.endpoints) ? imported.endpoints : state.endpoints,
      agents: Array.isArray(imported.agents) ? imported.agents : state.agents,
      pendingActions: Array.isArray(imported.pendingActions) ? imported.pendingActions : state.pendingActions ?? [],
      runHistory: Array.isArray(imported.runHistory) ? imported.runHistory : state.runHistory ?? []
    });
    await this.saveState(normalized.state);
  }

  async getApiKey(endpointId: string): Promise<string | undefined> {
    const secretKey = await this.context.secrets.get(this.secretKey(endpointId));
    return secretKey ?? this.getLocalApiKey(endpointId);
  }

  private async saveState(state: PersistedState): Promise<void> {
    await this.context.globalState.update(STATE_KEY, state);
  }

  private secretKey(endpointId: string): string {
    return `${SECRET_PREFIX}${endpointId}`;
  }

  private async getLocalApiKey(endpointId: string): Promise<string | undefined> {
    const keys = await this.readLocalApiKeys();
    return keys[endpointId];
  }

  private async saveLocalApiKey(endpointId: string, apiKey: string): Promise<void> {
    const keys = await this.readLocalApiKeys();
    keys[endpointId] = apiKey;
    await this.writeLocalApiKeys(keys);
  }

  private async deleteLocalApiKey(endpointId: string): Promise<void> {
    const keys = await this.readLocalApiKeys();
    delete keys[endpointId];
    await this.writeLocalApiKeys(keys);
  }

  private async readLocalApiKeys(): Promise<Record<string, string>> {
    const uri = vscode.Uri.joinPath(this.context.globalStorageUri, LOCAL_KEY_FILE);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
      return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
    } catch {
      return {};
    }
  }

  private async writeLocalApiKeys(keys: Record<string, string>): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    const uri = vscode.Uri.joinPath(this.context.globalStorageUri, LOCAL_KEY_FILE);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(keys, null, 2), 'utf8'));
  }
}

function normalizeState(state: PersistedState): { state: PersistedState; changed: boolean } {
  let changed = false;
  const agents = state.agents
    .map((agent, index) => normalizeAgent(agent, index))
    .filter((agent): agent is AgentConfig => Boolean(agent));
  if (agents.length !== state.agents.length) {
    changed = true;
  }

  const endpoints = state.endpoints
    .map((endpoint, index) => normalizeEndpoint(endpoint, index))
    .filter((endpoint): endpoint is EndpointConfig => Boolean(endpoint))
    .map(endpoint => {
    if (endpoint.model) {
      return endpoint;
    }

    const assignedAgent = agents.find(agent => agent.endpointId === endpoint.id && agent.model);
    const model = endpoint.testModel || assignedAgent?.model;
    if (!model) {
      return endpoint;
    }

    changed = true;
    return {
      ...endpoint,
      model,
      reasoningEffort: endpoint.reasoningEffort ?? assignedAgent?.reasoningEffort,
      temperature: endpoint.temperature ?? assignedAgent?.temperature
    };
  });
  if (endpoints.length !== state.endpoints.length) {
    changed = true;
  }

  const pendingActions = state.pendingActions
    ?.map((action, index) => normalizePendingAction(action, index))
    .filter((action): action is PendingAction => Boolean(action)) ?? [];
  if (pendingActions.length !== (state.pendingActions ?? []).length) {
    changed = true;
  }

  const runHistory = state.runHistory
    ?.map((run, index) => normalizeRunHistoryEntry(run, index))
    .filter((run): run is RunHistoryEntry => Boolean(run)) ?? [];
  if (runHistory.length !== (state.runHistory ?? []).length) {
    changed = true;
  }

  return {
    changed,
    state: {
      ...state,
      endpoints,
      agents,
      pendingActions,
      runHistory
    }
  };
}

function normalizeEndpoint(value: unknown, index: number): EndpointConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const now = Date.now();
  return {
    id: stringValue(value.id) || createId(`endpoint_${index}`),
    name: stringValue(value.name) || `Endpoint ${index + 1}`,
    baseUrl: stringValue(value.baseUrl) || '',
    model: stringValue(value.model),
    apiKind: endpointApiKind(value.apiKind),
    apiPath: stringValue(value.apiPath),
    authMode: authMode(value.authMode),
    streaming: booleanValue(value.streaming),
    reasoningEffort: reasoningEffort(value.reasoningEffort),
    temperature: numberValue(value.temperature),
    testModel: stringValue(value.testModel),
    apiVersion: stringValue(value.apiVersion),
    organization: stringValue(value.organization),
    defaultHeaders: recordOfStrings(value.defaultHeaders),
    createdAt: numberValue(value.createdAt) ?? now,
    updatedAt: numberValue(value.updatedAt) ?? now
  };
}

function normalizeAgent(value: unknown, index: number): AgentConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const now = Date.now();
  return {
    id: stringValue(value.id) || createId(`agent_${index}`),
    name: stringValue(value.name) || `Agent ${index + 1}`,
    role: agentRole(value.role),
    endpointId: stringValue(value.endpointId),
    model: stringValue(value.model),
    reasoningEffort: reasoningEffort(value.reasoningEffort),
    systemPrompt: stringValue(value.systemPrompt) || '',
    temperature: numberValue(value.temperature),
    enabled: booleanValue(value.enabled) ?? true,
    createdAt: numberValue(value.createdAt) ?? now,
    updatedAt: numberValue(value.updatedAt) ?? now
  };
}

function normalizePendingAction(value: unknown, index: number): PendingAction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const kind = ['file-edit', 'file-delete', 'terminal-command'].includes(String(value.kind)) ? value.kind as PendingAction['kind'] : undefined;
  if (!kind) {
    return undefined;
  }

  const now = Date.now();
  const status = ['pending', 'applied', 'rejected', 'failed'].includes(String(value.status))
    ? value.status as PendingAction['status']
    : 'pending';
  return {
    id: stringValue(value.id) || createId(`action_${index}`),
    kind,
    title: stringValue(value.title) || kind,
    sourceAgentId: stringValue(value.sourceAgentId),
    sourceAgentName: stringValue(value.sourceAgentName),
    status,
    createdAt: numberValue(value.createdAt) ?? now,
    updatedAt: numberValue(value.updatedAt) ?? now,
    fileEdit: isRecord(value.fileEdit) ? value.fileEdit as unknown as PendingAction['fileEdit'] : undefined,
    fileDelete: isRecord(value.fileDelete) ? value.fileDelete as unknown as PendingAction['fileDelete'] : undefined,
    terminalCommand: isRecord(value.terminalCommand) ? value.terminalCommand as unknown as PendingAction['terminalCommand'] : undefined,
    result: stringValue(value.result)
  };
}

function normalizeRunHistoryEntry(value: unknown, index: number): RunHistoryEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = ['completed', 'failed', 'cancelled'].includes(String(value.status))
    ? value.status as RunHistoryEntry['status']
    : 'failed';
  const now = Date.now();
  return {
    id: stringValue(value.id) || createId(`run_${index}`),
    conversationId: stringValue(value.conversationId),
    userText: stringValue(value.userText) || 'Untitled run',
    status,
    startedAt: numberValue(value.startedAt) ?? now,
    finishedAt: numberValue(value.finishedAt) ?? now,
    updates: Array.isArray(value.updates) ? value.updates as RunHistoryEntry['updates'] : []
  };
}

function endpointApiKind(value: unknown): EndpointConfig['apiKind'] {
  return value === 'responses' || value === 'completions' || value === 'chat-completions' ? value : 'chat-completions';
}

function authMode(value: unknown): EndpointConfig['authMode'] {
  return value === 'api-key' || value === 'none' || value === 'bearer' ? value : 'bearer';
}

function agentRole(value: unknown): AgentConfig['role'] {
  return value === 'manager' || value === 'research' || value === 'web-search' || value === 'coding' || value === 'review' || value === 'custom'
    ? value
    : 'custom';
}

function reasoningEffort(value: unknown): EndpointConfig['reasoningEffort'] {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function recordOfStrings(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
