import { ActionProposalEnvelope, AgentConfig, PendingAction, ToolCall, ToolCallEnvelope } from './types';
import { createId, parseJsonObject } from './utils';

export function extractToolCalls(text: string): ToolCall[] {
  const parsed = parseJsonObject<ToolCallEnvelope>(text);
  if (!parsed?.toolCalls?.length) {
    return [];
  }

  return parsed.toolCalls.filter(isToolCall).slice(0, 8);
}

export function extractPendingActions(text: string, sourceAgent: AgentConfig): PendingAction[] {
  const parsed = parseJsonObject<ActionProposalEnvelope>(text);
  if (!parsed) {
    return [];
  }

  const now = Date.now();
  const fileActions: PendingAction[] = (parsed.fileEdits ?? [])
    .filter(edit => edit.path && edit.content !== undefined)
    .map(edit => ({
      id: createId('action'),
      kind: 'file-edit',
      title: edit.description || `Edit ${edit.path}`,
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      fileEdit: edit
    }));

  const fileDeleteActions: PendingAction[] = (parsed.fileDeletes ?? [])
    .filter(fileDelete => fileDelete.path)
    .map(fileDelete => ({
      id: createId('action'),
      kind: 'file-delete',
      title: fileDelete.description || `Delete ${fileDelete.path}`,
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      fileDelete
    }));

  const terminalActions: PendingAction[] = (parsed.terminalCommands ?? [])
    .filter(command => command.command)
    .map(command => ({
      id: createId('action'),
      kind: 'terminal-command',
      title: command.description || command.command,
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      terminalCommand: command
    }));

  return [...fileActions, ...fileDeleteActions, ...terminalActions].slice(0, 20);
}

function isToolCall(value: ToolCall): boolean {
  return [
    'web_search',
    'fetch_url',
    'list_directory',
    'list_files',
    'read_file',
    'read_files',
    'search_workspace',
    'get_diagnostics',
    'edit_file',
    'write_file',
    'delete_file',
    'run_terminal_command'
  ].includes(value.name)
    && typeof value.arguments === 'object'
    && value.arguments !== null;
}
