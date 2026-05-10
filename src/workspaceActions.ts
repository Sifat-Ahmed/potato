import * as vscode from 'vscode';
import { PendingAction } from './types';
import { resolveWorkspaceUri } from './toolRunner';

export async function applyFileEdit(action: PendingAction): Promise<string> {
  const edit = action.fileEdit;
  if (!edit) {
    throw new Error('Action is not a file edit.');
  }

  const uri = resolveWorkspaceUri(edit.path);
  await vscode.workspace.fs.createDirectory(resolveWorkspaceParentUri(edit.path));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(edit.content, 'utf8'));
  return `Wrote ${edit.path}.`;
}

export function runApprovedTerminalCommand(action: PendingAction): string {
  const command = action.terminalCommand;
  if (!command) {
    throw new Error('Action is not a terminal command.');
  }

  const terminal = vscode.window.createTerminal({
    name: 'Potato Action',
    cwd: command.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
  terminal.show();
  terminal.sendText(command.command);
  return `Started terminal command: ${command.command}`;
}

function resolveWorkspaceParentUri(relativePath: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder is open.');
  }

  const parts = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts.some(part => part === '..')) {
    throw new Error('Workspace paths cannot contain .. segments.');
  }

  return parts.length > 1 ? vscode.Uri.joinPath(folder.uri, ...parts.slice(0, -1)) : folder.uri;
}
