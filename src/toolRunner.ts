import * as vscode from 'vscode';
import { AgentConfig, PendingAction, ToolCall, ToolResult } from './types';
import { createId } from './utils';

const MAX_TOOL_BYTES = 12000;

export class ToolRunner {
  async run(call: ToolCall, sourceAgent?: AgentConfig): Promise<ToolResult> {
    try {
      switch (call.name) {
        case 'web_search':
          return { name: call.name, ok: true, content: await this.webSearch(String(call.arguments.query ?? '')) };
        case 'fetch_url':
          return { name: call.name, ok: true, content: await this.fetchUrl(String(call.arguments.url ?? '')) };
        case 'list_files':
          return { name: call.name, ok: true, content: await this.listFiles(String(call.arguments.glob ?? '**/*')) };
        case 'read_file':
          return {
            name: call.name,
            ok: true,
            content: await this.readFile(String(call.arguments.path ?? ''), numberArg(call.arguments.maxBytes, MAX_TOOL_BYTES))
          };
        case 'search_workspace':
          return { name: call.name, ok: true, content: await this.searchWorkspace(String(call.arguments.query ?? '')) };
        case 'write_file':
          return this.queueFileWrite(call, sourceAgent);
        case 'delete_file':
          return this.queueFileDelete(call, sourceAgent);
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

  private async readFile(relativePath: string, maxBytes: number): Promise<string> {
    const uri = resolveWorkspaceUri(relativePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8').slice(0, Math.min(Math.max(maxBytes, 1), MAX_TOOL_BYTES));
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

  private queueFileWrite(call: ToolCall, sourceAgent?: AgentConfig): ToolResult {
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

    const action: PendingAction = {
      id: createId('action'),
      kind: 'file-edit',
      title: String(call.arguments.description ?? `Write ${path}`),
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fileEdit: {
        path,
        content,
        description: typeof call.arguments.description === 'string' ? call.arguments.description : undefined
      }
    };

    return {
      name: call.name,
      ok: true,
      content: `Queued file write for approval: ${path}`,
      actions: [action]
    };
  }

  private queueFileDelete(call: ToolCall, sourceAgent?: AgentConfig): ToolResult {
    if (!sourceAgent) {
      throw new Error('delete_file requires an agent approval context.');
    }

    const path = String(call.arguments.path ?? '').trim();
    if (!path) {
      throw new Error('delete_file requires a path.');
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

function numberArg(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}
