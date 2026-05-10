export type EndpointApiKind = 'chat-completions' | 'responses' | 'completions';

export type AuthMode = 'bearer' | 'api-key' | 'none';

export interface EndpointConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKind: EndpointApiKind;
  apiPath?: string;
  authMode: AuthMode;
  apiVersion?: string;
  organization?: string;
  defaultHeaders?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export type AgentRole = 'manager' | 'research' | 'web-search' | 'coding' | 'review' | 'custom';

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  endpointId?: string;
  model?: string;
  systemPrompt: string;
  temperature?: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentCallRequest {
  agent: AgentConfig;
  input: string;
  messages?: ChatMessage[];
  abortSignal?: AbortSignal;
}

export interface AgentCallResult {
  agentId: string;
  agentName: string;
  text: string;
  raw?: unknown;
}

export interface DelegationTask {
  agentId: string;
  title: string;
  instructions: string;
}

export interface OrchestratorRunUpdate {
  kind: 'status' | 'plan' | 'agent-result' | 'final' | 'error';
  message: string;
  task?: DelegationTask;
  result?: AgentCallResult;
}

export interface PersistedState {
  endpoints: EndpointConfig[];
  agents: AgentConfig[];
}

export interface PublicEndpointConfig extends EndpointConfig {
  hasApiKey: boolean;
}

export interface PublicState {
  endpoints: PublicEndpointConfig[];
  agents: AgentConfig[];
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'runTask'; text: string }
  | { type: 'saveEndpoint'; endpoint: Omit<EndpointConfig, 'createdAt' | 'updatedAt'>; apiKey?: string }
  | { type: 'deleteEndpoint'; endpointId: string }
  | { type: 'saveAgent'; agent: Omit<AgentConfig, 'createdAt' | 'updatedAt'> }
  | { type: 'deleteAgent'; agentId: string }
  | { type: 'resetStarterAgents' };

export type ExtensionToWebviewMessage =
  | { type: 'state'; state: PublicState }
  | { type: 'runUpdate'; update: OrchestratorRunUpdate }
  | { type: 'notice'; level: 'info' | 'warning' | 'error'; message: string };
