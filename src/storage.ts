import * as vscode from 'vscode';
import { AgentConfig, EndpointConfig, PendingAction, PersistedState, PublicState, RunHistoryEntry } from './types';
import { createStarterAgents } from './starterData';

const STATE_KEY = 'orchestrator.state.v1';
const SECRET_PREFIX = 'orchestrator.endpointKey.';
const LOCAL_KEY_FILE = 'endpoint-keys.local.json';

export class OrchestratorStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getState(): Promise<PersistedState> {
    const state = this.context.globalState.get<PersistedState>(STATE_KEY);
    if (state) {
      return {
        endpoints: Array.isArray(state.endpoints) ? state.endpoints : [],
        agents: Array.isArray(state.agents) ? state.agents : [],
        pendingActions: Array.isArray(state.pendingActions) ? state.pendingActions : [],
        runHistory: Array.isArray(state.runHistory) ? state.runHistory : []
      };
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
    await this.saveState({
      endpoints: Array.isArray(imported.endpoints) ? imported.endpoints : state.endpoints,
      agents: Array.isArray(imported.agents) ? imported.agents : state.agents,
      pendingActions: Array.isArray(imported.pendingActions) ? imported.pendingActions : state.pendingActions ?? [],
      runHistory: Array.isArray(imported.runHistory) ? imported.runHistory : state.runHistory ?? []
    });
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
