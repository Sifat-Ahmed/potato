import * as vscode from 'vscode';
import { AgentConfig, ApprovalMode, PendingAction, ToolCall, ToolResult } from './types';
import { createId } from './utils';

const MAX_TOOL_BYTES = 12000;
const MAX_EDIT_BYTES = 250000;

export class ToolRunner {
  constructor(private readonly approvalMode: ApprovalMode = 'manual') {}

  async run(call: ToolCall, sourceAgent?: AgentConfig): Promise<ToolResult> {
    try {
      switch (call.name) {
        case 'web_search':
          return { name: call.name, ok: true, content: await this.webSearch(String(call.arguments.query ?? '')) };
        case 'fetch_url':
          return { name: call.name, ok: true, content: await this.fetchUrl(String(call.arguments.url ?? '')) };
        case 'list_directory':
          return { name: call.name, ok: true, content: await this.listDirectory(String(call.arguments.path ?? '.')) };
        case 'list_files':
          return { name: call.name, ok: true, content: await this.listFiles(String(call.arguments.glob ?? '**/*')) };
        case 'read_file':
          return {
            name: call.name,
            ok: true,
            content: await this.readFile(String(call.arguments.path ?? ''), numberArg(call.arguments.maxBytes, MAX_TOOL_BYTES))
          };
        case 'read_files':
          return {
            name: call.name,
            ok: true,
            content: await this.readFiles(arrayArg(call.arguments.paths), numberArg(call.arguments.maxBytesPerFile, MAX_TOOL_BYTES))
          };
        case 'search_workspace':
          return { name: call.name, ok: true, content: await this.searchWorkspace(String(call.arguments.query ?? '')) };
        case 'get_diagnostics':
          return { name: call.name, ok: true, content: this.getDiagnostics(optionalStringArg(call.arguments.path)) };
        case 'edit_file':
          return await this.queueTargetedFileEdit(call, sourceAgent);
        case 'write_file':
          return await this.queueFileWrite(call, sourceAgent);
        case 'delete_file':
          return await this.queueFileDelete(call, sourceAgent);
        case 'run_terminal_command':
          return this.queueTerminalCommand(call, sourceAgent);
      }
    } catch (error) {
      return {
        name: call.name,
        ok: false,
        content: error instanceof Error ? error.message : 'Tool failed.'
      };
    }
  }

  private async webSearch(query: string): Promise<string> {
    if (!query.trim()) {
      throw new Error('web_search requires a query.');
    }

    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_redirect', '1');
    url.searchParams.set('no_html', '1');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}.`);
    }

    const data = await response.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
    };

    const rows: string[] = [];
    if (data.AbstractText) {
      rows.push(`${data.AbstractText}${data.AbstractURL ? `\nSource: ${data.AbstractURL}` : ''}`);
    }

    for (const topic of data.RelatedTopics ?? []) {
      if ('Text' in topic && topic.Text) {
        rows.push(`${topic.Text}${topic.FirstURL ? `\nSource: ${topic.FirstURL}` : ''}`);
      }
      if ('Topics' in topic) {
        for (const nested of topic.Topics ?? []) {
          if (nested.Text) {
            rows.push(`${nested.Text}${nested.FirstURL ? `\nSource: ${nested.FirstURL}` : ''}`);
          }
        }
      }
    }

    return rows.slice(0, 8).join('\n\n') || 'No instant search result found.';
  }

  private async fetchUrl(rawUrl: string): Promise<string> {
    if (!rawUrl.trim()) {
      throw new Error('fetch_url requires a url.');
    }

    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('fetch_url only supports http and https URLs.');
    }

    const response = await fetch(url, {
      headers: {
        accept: 'text/plain,text/html,application/json;q=0.9,*/*;q=0.5'
      }
    });
    if (!response.ok) {
      throw new Error(`Fetch returned ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    const normalized = contentType.includes('text/html') ? stripHtml(text) : text;
    return normalized.trim().slice(0, MAX_TOOL_BYTES) || 'No readable content returned.';
  }

  private async listFiles(glob: string): Promise<string> {
    const files = await vscode.workspace.findFiles(
      glob || '**/*',
      '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**}',
      200
    );

    return files.map(file => vscode.workspace.asRelativePath(file, false)).join('\n') || 'No files matched.';
  }

  private async listDirectory(relativePath: string): Promise<string> {
    const uri = resolveWorkspaceUri(relativePath || '.');
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 200)
      .map(([name, type]) => `${type === vscode.FileType.Directory ? 'dir ' : 'file'} ${name}`)
      .join('\n') || 'Directory is empty.';
  }

  private async readFile(relativePath: string, maxBytes: number): Promise<string> {
    const uri = resolveWorkspaceUri(relativePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8').slice(0, Math.min(Math.max(maxBytes, 1), MAX_TOOL_BYTES));
  }

  private async readFiles(paths: unknown[], maxBytesPerFile: number): Promise<string> {
    const filePaths = paths
      .map(path => optionalStringArg(path))
      .filter((path): path is string => Boolean(path))
      .slice(0, 8);
    if (filePaths.length === 0) {
      throw new Error('read_files requires a paths array.');
    }

    const cappedBytes = Math.min(Math.max(maxBytesPerFile, 1), MAX_TOOL_BYTES);
    const sections = await Promise.all(filePaths.map(async path => [
      `--- ${path} ---`,
      await this.readFile(path, cappedBytes)
    ].join('\n')));
    return sections.join('\n\n');
  }

  private async searchWorkspace(query: string): Promise<string> {
    if (!query.trim()) {
      throw new Error('search_workspace requires a query.');
    }

    const files = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**}',
      250
    );
    const matches: string[] = [];

    for (const file of files) {
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString('utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          matches.push(`${vscode.workspace.asRelativePath(file, false)}:${index + 1}: ${line.trim()}`);
        }
      });
      if (matches.length >= 80) {
        break;
      }
    }

    return matches.join('\n') || 'No workspace matches found.';
  }

  private getDiagnostics(relativePath?: string): string {
    const uri = relativePath ? resolveWorkspaceUri(relativePath) : undefined;
    const diagnostics = relativePath
      ? [[uri as vscode.Uri, vscode.languages.getDiagnostics(uri as vscode.Uri)] as [vscode.Uri, vscode.Diagnostic[]]]
      : vscode.languages.getDiagnostics();

    const rows = diagnostics.flatMap(([uri, items]) => items.map(item => {
      const path = vscode.workspace.asRelativePath(uri, false);
      const line = item.range.start.line + 1;
      const column = item.range.start.character + 1;
      return `${path}:${line}:${column}: ${severityName(item.severity)}: ${item.message}`;
    }));

    return rows.slice(0, 100).join('\n') || 'No VS Code diagnostics found.';
  }

  private async queueTargetedFileEdit(call: ToolCall, sourceAgent?: AgentConfig): Promise<ToolResult> {
    if (!sourceAgent) {
      throw new Error('edit_file requires an agent approval context.');
    }

    const path = String(call.arguments.path ?? '').trim();
    const oldText = call.arguments.oldText;
    const newText = call.arguments.newText;
    const replaceAll = Boolean(call.arguments.replaceAll);
    if (!path) {
      throw new Error('edit_file requires a path.');
    }
    if (typeof oldText !== 'string' || oldText.length === 0) {
      throw new Error('edit_file requires non-empty oldText.');
    }
    if (typeof newText !== 'string') {
      throw new Error('edit_file requires string newText.');
    }

    const uri = resolveWorkspaceUri(path);
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > MAX_EDIT_BYTES) {
      throw new Error(`edit_file refuses to edit files larger than ${MAX_EDIT_BYTES} bytes.`);
    }

    const original = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const matchCount = original.split(oldText).length - 1;
    if (matchCount === 0) {
      throw new Error(`edit_file oldText was not found in ${path}.`);
    }
    if (matchCount > 1 && !replaceAll) {
      throw new Error(`edit_file oldText matched ${matchCount} times in ${path}; set replaceAll true or provide a more specific oldText.`);
    }

    const content = replaceAll ? original.split(oldText).join(newText) : original.replace(oldText, newText);
    return this.queueFileEditAction(
      call.name,
      path,
      content,
      String(call.arguments.description ?? `Edit ${path}`),
      sourceAgent,
      typeof call.arguments.description === 'string' ? call.arguments.description : undefined
    );
  }

  private async queueFileWrite(call: ToolCall, sourceAgent?: AgentConfig): Promise<ToolResult> {
    if (!sourceAgent) {
      throw new Error('write_file requires an agent approval context.');
    }

    const path = String(call.arguments.path ?? '').trim();
    const content = call.arguments.content;
    if (!path) {
      throw new Error('write_file requires a path.');
    }
    if (typeof content !== 'string') {
      throw new Error('write_file requires string content.');
    }

    return this.queueFileEditAction(
      call.name,
      path,
      content,
      String(call.arguments.description ?? `Write ${path}`),
      sourceAgent,
      typeof call.arguments.description === 'string' ? call.arguments.description : undefined
    );
  }

  private async queueFileEditAction(
    toolName: ToolCall['name'],
    path: string,
    content: string,
    title: string,
    sourceAgent: AgentConfig,
    description?: string
  ): Promise<ToolResult> {
    if (this.approvalMode === 'full-access') {
      const uri = resolveWorkspaceUri(path);
      await vscode.workspace.fs.createDirectory(resolveWorkspaceParentUri(path));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      return {
        name: toolName,
        ok: true,
        content: `Applied file edit: ${path}`
      };
    }

    const action: PendingAction = {
      id: createId('action'),
      kind: 'file-edit',
      title,
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fileEdit: {
        path,
        content,
        description
      }
    };

    return {
      name: toolName,
      ok: true,
      content: `Queued file edit for approval: ${path}`,
      actions: [action]
    };
  }

  private async queueFileDelete(call: ToolCall, sourceAgent?: AgentConfig): Promise<ToolResult> {
    if (!sourceAgent) {
      throw new Error('delete_file requires an agent approval context.');
    }

    const path = String(call.arguments.path ?? '').trim();
    if (!path) {
      throw new Error('delete_file requires a path.');
    }

    if (this.approvalMode === 'full-access') {
      const uri = resolveWorkspaceUri(path);
      await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: true });
      return {
        name: call.name,
        ok: true,
        content: `Deleted ${path}.`
      };
    }

    const action: PendingAction = {
      id: createId('action'),
      kind: 'file-delete',
      title: String(call.arguments.description ?? `Delete ${path}`),
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fileDelete: {
        path,
        description: typeof call.arguments.description === 'string' ? call.arguments.description : undefined
      }
    };

    return {
      name: call.name,
      ok: true,
      content: `Queued file delete for approval: ${path}`,
      actions: [action]
    };
  }

  private queueTerminalCommand(call: ToolCall, sourceAgent?: AgentConfig): ToolResult {
    if (!sourceAgent) {
      throw new Error('run_terminal_command requires an agent approval context.');
    }

    const command = String(call.arguments.command ?? '').trim();
    const cwd = optionalStringArg(call.arguments.cwd);
    if (!command) {
      throw new Error('run_terminal_command requires a command.');
    }

    if (this.approvalMode === 'full-access') {
      const terminal = vscode.window.createTerminal({
        name: 'Potato Agent',
        cwd: cwd ? resolveWorkspaceUri(cwd).fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      });
      terminal.show();
      terminal.sendText(command);
      return {
        name: call.name,
        ok: true,
        content: `Started terminal command: ${command}`
      };
    }

    const action: PendingAction = {
      id: createId('action'),
      kind: 'terminal-command',
      title: String(call.arguments.description ?? command),
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      terminalCommand: {
        command,
        cwd,
        description: typeof call.arguments.description === 'string' ? call.arguments.description : undefined
      }
    };

    return {
      name: call.name,
      ok: true,
      content: `Queued terminal command for approval: ${command}`,
      actions: [action]
    };
  }
}

export function resolveWorkspaceUri(relativePath: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder is open.');
  }

  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..')) {
    throw new Error('Workspace paths cannot contain .. segments.');
  }

  return vscode.Uri.joinPath(folder.uri, normalized);
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

function numberArg(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arrayArg(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalStringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function severityName(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    case vscode.DiagnosticSeverity.Hint:
      return 'hint';
    default:
      return 'diagnostic';
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}
