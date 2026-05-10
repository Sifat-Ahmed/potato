import * as vscode from 'vscode';
import { AgentConfig, EndpointConfig, PersistedState, PublicState } from './types';
import { createStarterAgents } from './starterData';

const STATE_KEY = 'orchestrator.state.v1';
const SECRET_PREFIX = 'orchestrator.endpointKey.';

export class OrchestratorStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getState(): Promise<PersistedState> {
    const state = this.context.globalState.get<PersistedState>(STATE_KEY);
    if (state) {
      return {
        endpoints: Array.isArray(state.endpoints) ? state.endpoints : [],
        agents: Array.isArray(state.agents) ? state.agents : []
      };
    }

    const starterState: PersistedState = {
      endpoints: [],
      agents: createStarterAgents()
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
      agents: state.agents
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
      }
    }
  }

  async deleteEndpoint(endpointId: string): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      endpoints: state.endpoints.filter(endpoint => endpoint.id !== endpointId),
      agents: state.agents.map(agent =>
        agent.endpointId === endpointId ? { ...agent, endpointId: undefined, updatedAt: Date.now() } : agent
      )
    });
    await this.context.secrets.delete(this.secretKey(endpointId));
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

  async getApiKey(endpointId: string): Promise<string | undefined> {
    return this.context.secrets.get(this.secretKey(endpointId));
  }

  private async saveState(state: PersistedState): Promise<void> {
    await this.context.globalState.update(STATE_KEY, state);
  }

  private secretKey(endpointId: string): string {
    return `${SECRET_PREFIX}${endpointId}`;
  }
}
