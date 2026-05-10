import * as vscode from 'vscode';

const MAX_FILE_LIST = 120;
const MAX_SNIPPET_CHARS = 8000;

export async function createWorkspaceContext(): Promise<string> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return 'Workspace context: no folder is open.';
  }

  const fileUris = await vscode.workspace.findFiles(
    '**/*',
    '{**/node_modules/**,**/out/**,**/.git/**,**/dist/**,**/build/**}',
    MAX_FILE_LIST
  );

  const activeEditor = vscode.window.activeTextEditor;
  const activeFile = activeEditor
    ? vscode.workspace.asRelativePath(activeEditor.document.uri, false)
    : undefined;
  const activeSnippet = activeEditor ? getActiveSnippet(activeEditor) : undefined;

  return [
    'Workspace context:',
    `Folders: ${folders.map(folder => folder.name).join(', ')}`,
    activeFile ? `Active file: ${activeFile}` : 'Active file: none',
    '',
    `File list sample (${fileUris.length}${fileUris.length === MAX_FILE_LIST ? '+' : ''}):`,
    ...fileUris.map(uri => `- ${vscode.workspace.asRelativePath(uri, false)}`),
    activeSnippet
      ? ['', 'Active editor snippet:', '```', activeSnippet, '```'].join('\n')
      : ''
  ].filter(Boolean).join('\n');
}

function getActiveSnippet(editor: vscode.TextEditor): string {
  const document = editor.document;
  const selectedText = editor.selection.isEmpty ? '' : document.getText(editor.selection);
  const text = selectedText || document.getText();

  if (text.length <= MAX_SNIPPET_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_SNIPPET_CHARS)}\n...[truncated]`;
}
