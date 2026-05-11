export type EndpointApiKind = 'chat-completions' | 'responses' | 'completions';

export type AuthMode = 'bearer' | 'api-key' | 'none';

export interface EndpointConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKind: EndpointApiKind;
  apiPath?: string;
  authMode: AuthMode;
  streaming?: boolean;
  testModel?: string;
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
  stream?: boolean;
  onToken?: (token: string) => void;
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

export type ToolName = 'web_search' | 'list_files' | 'read_file' | 'search_workspace';

export interface ToolCall {
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolCallEnvelope {
  toolCalls?: ToolCall[];
}

export interface ToolResult {
  name: ToolName;
  ok: boolean;
  content: string;
}

export interface FileEditProposal {
  path: string;
  content: string;
  description?: string;
}

export interface TerminalCommandProposal {
  command: string;
  cwd?: string;
  description?: string;
}

export interface ActionProposalEnvelope {
  fileEdits?: FileEditProposal[];
  terminalCommands?: TerminalCommandProposal[];
}

export type PendingActionKind = 'file-edit' | 'terminal-command';

export type PendingActionStatus = 'pending' | 'applied' | 'rejected' | 'failed';

export interface PendingAction {
  id: string;
  kind: PendingActionKind;
  title: string;
  sourceAgentId?: string;
  sourceAgentName?: string;
  status: PendingActionStatus;
  createdAt: number;
  updatedAt: number;
  fileEdit?: FileEditProposal;
  terminalCommand?: TerminalCommandProposal;
  result?: string;
}

export interface RunHistoryEntry {
  id: string;
  userText: string;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  finishedAt: number;
  updates: OrchestratorRunUpdate[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  path: string;
  size: number;
  mediaType: string;
  binary: boolean;
  truncated: boolean;
  content?: string;
}

export interface OrchestratorRunUpdate {
  kind: 'status' | 'plan' | 'agent-result' | 'final' | 'error' | 'token' | 'tool-result' | 'action-proposal' | 'cancelled';
  message: string;
  task?: DelegationTask;
  result?: AgentCallResult;
  actions?: PendingAction[];
}

export interface PersistedState {
  endpoints: EndpointConfig[];
  agents: AgentConfig[];
  pendingActions?: PendingAction[];
  runHistory?: RunHistoryEntry[];
}

export interface PublicEndpointConfig extends EndpointConfig {
  hasApiKey: boolean;
}

export interface PublicState {
  endpoints: PublicEndpointConfig[];
  agents: AgentConfig[];
  pendingActions: PendingAction[];
  runHistory: RunHistoryEntry[];
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'runTask'; text: string }
  | { type: 'cancelRun' }
  | { type: 'attachFiles' }
  | { type: 'removeAttachment'; attachmentId: string }
  | { type: 'clearAttachments' }
  | { type: 'testEndpoint'; endpointId: string }
  | { type: 'saveAndTestEndpoint'; endpoint: Omit<EndpointConfig, 'createdAt' | 'updatedAt'>; apiKey?: string }
  | { type: 'loadEndpointKey'; endpointId: string }
  | { type: 'saveEndpoint'; endpoint: Omit<EndpointConfig, 'createdAt' | 'updatedAt'>; apiKey?: string }
  | { type: 'deleteEndpoint'; endpointId: string }
  | { type: 'saveAgent'; agent: Omit<AgentConfig, 'createdAt' | 'updatedAt'> }
  | { type: 'deleteAgent'; agentId: string }
  | { type: 'resetStarterAgents' }
  | { type: 'applyAction'; actionId: string }
  | { type: 'rejectAction'; actionId: string }
  | { type: 'exportConfig' }
  | { type: 'importConfig' };

export type ExtensionToWebviewMessage =
  | { type: 'state'; state: PublicState }
  | { type: 'attachments'; attachments: ChatAttachment[] }
  | { type: 'endpointKey'; endpointId: string; apiKey?: string }
  | { type: 'runUpdate'; update: OrchestratorRunUpdate }
  | { type: 'notice'; level: 'info' | 'warning' | 'error'; message: string };
