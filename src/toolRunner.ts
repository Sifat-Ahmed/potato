import * as vscode from 'vscode';
import { ToolCall, ToolResult } from './types';

const MAX_TOOL_BYTES = 12000;

export class ToolRunner {
  async run(call: ToolCall): Promise<ToolResult> {
    try {
      switch (call.name) {
        case 'web_search':
          return { name: call.name, ok: true, content: await this.webSearch(String(call.arguments.query ?? '')) };
        case 'list_files':
          return { name: call.name, ok: true, content: await this.listFiles(String(call.arguments.glob ?? '**/*')) };
        case 'read_file':
          return { name: call.name, ok: true, content: await this.readFile(String(call.arguments.path ?? '')) };
        case 'search_workspace':
          return { name: call.name, ok: true, content: await this.searchWorkspace(String(call.arguments.query ?? '')) };
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

  private async listFiles(glob: string): Promise<string> {
    const files = await vscode.workspace.findFiles(
      glob || '**/*',
      '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**}',
      200
    );

    return files.map(file => vscode.workspace.asRelativePath(file, false)).join('\n') || 'No files matched.';
  }

  private async readFile(relativePath: string): Promise<string> {
    const uri = resolveWorkspaceUri(relativePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8').slice(0, MAX_TOOL_BYTES);
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
