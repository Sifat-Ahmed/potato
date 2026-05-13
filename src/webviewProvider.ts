import * as vscode from 'vscode';
import { ConversationDatabase } from './conversationDatabase';
import { LlmClient } from './llmClient';
import { OrchestratorRuntime } from './orchestrator';
import { OrchestratorStorage } from './storage';
import { ToolRunner } from './toolRunner';
import { ChatAttachment, ExtensionToWebviewMessage, OrchestratorRunUpdate, RunHistoryEntry, WebviewToExtensionMessage } from './types';
import { asErrorMessage, createId } from './utils';
import { renderWebviewHtml } from './webviewHtml';
import { applyFileDelete, applyFileEdit, runApprovedTerminalCommand } from './workspaceActions';
import { createWorkspaceContext } from './workspaceContext';

interface ActiveRun {
  controller: AbortController;
  conversationId: string;
  startedAt: number;
  userText: string;
  updates: OrchestratorRunUpdate[];
}

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 120000;

export class OrchestratorWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'orchestrator.workbench';

  private view?: vscode.WebviewView;
  private activeRun?: ActiveRun;
  private attachments: ChatAttachment[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: OrchestratorStorage,
    private readonly conversationDatabase: ConversationDatabase,
    private readonly output: vscode.OutputChannel
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.output.appendLine('Resolving orchestrator webview.');
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.render(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(message => {
      void this.handleMessage(message as WebviewToExtensionMessage);
    });
    void this.refresh();
    this.output.appendLine('Potato webview resolved.');
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand('orchestrator.workbench.focus');
  }

  async refresh(): Promise<void> {
    const [state, conversations] = await Promise.all([
      this.storage.getPublicState(),
      this.conversationDatabase.getPublicState()
    ]);
    this.post({ type: 'state', state: { ...state, ...conversations } });
    this.post({ type: 'attachments', attachments: this.attachments });
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          await this.refresh();
          break;
        case 'runTask':
          await this.runTask(message.text);
          break;
        case 'cancelRun':
          this.cancelRun();
          break;
        case 'attachFiles':
          await this.attachFiles();
          break;
        case 'removeAttachment':
          this.attachments = this.attachments.filter(attachment => attachment.id !== message.attachmentId);
          this.post({ type: 'attachments', attachments: this.attachments });
          break;
        case 'clearAttachments':
          this.attachments = [];
          this.post({ type: 'attachments', attachments: this.attachments });
          break;
        case 'newConversation':
          await this.conversationDatabase.createConversation();
          await this.refresh();
          break;
        case 'openConversation':
          await this.conversationDatabase.openConversation(message.conversationId);
          await this.refresh();
          break;
        case 'deleteConversation':
          await this.conversationDatabase.deleteConversation(message.conversationId);
          await this.refresh();
          break;
        case 'testEndpoint':
          await this.testEndpoint(message.endpointId);
          break;
        case 'saveAndTestEndpoint':
          await this.storage.saveEndpoint(message.endpoint, message.apiKey);
          await this.refresh();
          await this.testEndpoint(message.endpoint.id);
          break;
        case 'loadEndpointKey':
          this.post({
            type: 'endpointKey',
            endpointId: message.endpointId,
            apiKey: await this.storage.getApiKey(message.endpointId)
          });
          break;
        case 'saveEndpoint':
          await this.storage.saveEndpoint(message.endpoint, message.apiKey);
          await this.refresh();
          this.post({ type: 'notice', level: 'info', message: 'Endpoint saved.' });
          break;
        case 'deleteEndpoint':
          await this.storage.deleteEndpoint(message.endpointId);
          await this.refresh();
          break;
        case 'saveAgent':
          await this.storage.saveAgent(message.agent);
          await this.refresh();
          this.post({ type: 'notice', level: 'info', message: 'Agent saved.' });
          break;
        case 'deleteAgent':
          await this.storage.deleteAgent(message.agentId);
          await this.refresh();
          break;
        case 'resetStarterAgents':
          await this.storage.resetStarterAgents();
          await this.refresh();
          break;
        case 'applyAction':
          await this.applyAction(message.actionId);
          break;
        case 'rejectAction':
          await this.storage.updatePendingAction(message.actionId, { status: 'rejected', result: 'Rejected by user.' });
          await this.refresh();
          break;
        case 'exportConfig':
          await this.exportConfig();
          break;
        case 'importConfig':
          await this.importConfig();
          break;
      }
    } catch (error) {
      const messageText = asErrorMessage(error);
      this.output.appendLine(`Webview message failed: ${messageText}`);
      if (message.type === 'runTask') {
        this.post({ type: 'runUpdate', update: { kind: 'error', message: messageText } });
      }
      this.post({ type: 'notice', level: 'error', message: messageText });
    }
  }

  private async runTask(text: string): Promise<void> {
    const trimmed = text.trim();
    if ((!trimmed && this.attachments.length === 0) || this.activeRun) {
      return;
    }

    const controller = new AbortController();
    const updates: OrchestratorRunUpdate[] = [];
    const userText = trimmed || `${this.attachments.length} attached file(s)`;
    const conversation = await this.conversationDatabase.getOrCreateActiveConversation(userText);
    const conversationContext = await this.conversationDatabase.buildContext(conversation.id);
    await this.conversationDatabase.appendMessage(conversation.id, {
      role: 'user',
      content: userText
    });
    this.activeRun = {
      controller,
      conversationId: conversation.id,
      startedAt: Date.now(),
      userText,
      updates
    };

    try {
      this.post({ type: 'notice', level: 'info', message: 'Run started.' });
      const state = await this.storage.getState();
      const workspaceContext = await createWorkspaceContext();
      const attachmentContext = createAttachmentContext(this.attachments);
      const userTask = trimmed || 'Use the attached files as the user input and respond with the most relevant help.';
      const input = `${userTask}\n\n${conversationContext}\n\n${attachmentContext}\n\n${workspaceContext}`;
      const runtime = new OrchestratorRuntime(
        new LlmClient(endpointId => this.storage.getApiKey(endpointId)),
        update => {
          updates.push(update);
          this.post({ type: 'runUpdate', update });
          if (update.kind === 'action-proposal') {
            void this.refresh();
          }
        },
        new ToolRunner(),
        async actions => {
          await this.storage.addPendingActions(actions);
        }
      );

      await runtime.run(input, state.endpoints, state.agents, controller.signal);
    } catch (error) {
      const update: OrchestratorRunUpdate = {
        kind: 'error',
        message: asErrorMessage(error)
      };
      updates.push(update);
      this.post({ type: 'runUpdate', update });
    } finally {
      const activeRun = this.activeRun;
      if (!activeRun) {
        return;
      }

      const status = updates.some(update => update.kind === 'cancelled')
        ? 'cancelled'
        : updates.some(update => update.kind === 'error')
          ? 'failed'
          : 'completed';

      const entry: RunHistoryEntry = {
        id: createId('run'),
        conversationId: activeRun.conversationId,
        userText: activeRun.userText,
        status,
        startedAt: activeRun.startedAt,
        finishedAt: Date.now(),
        updates
      };
      this.activeRun = undefined;
      this.attachments = [];
      try {
        await this.storage.addRunHistory(entry);
        const outcome = [...updates].reverse().find(update =>
          update.kind === 'final' || update.kind === 'error' || update.kind === 'cancelled'
        );
        if (outcome) {
          await this.conversationDatabase.appendMessage(activeRun.conversationId, {
            role: outcome.kind === 'final' ? 'assistant' : 'system',
            content: outcome.message,
            runId: entry.id,
            updateKind: outcome.kind
          });
        }
      } catch (error) {
        this.output.appendLine(`Failed to persist run history: ${asErrorMessage(error)}`);
        this.post({ type: 'notice', level: 'warning', message: `Run completed, but history was not saved: ${asErrorMessage(error)}` });
      }
      await this.refresh();
    }
  }

  private cancelRun(): void {
    if (!this.activeRun) {
      return;
    }

    this.activeRun.controller.abort();
    this.post({ type: 'notice', level: 'warning', message: 'Cancelling current run.' });
  }

  private async testEndpoint(endpointId: string): Promise<void> {
    const state = await this.storage.getState();
    const endpoint = state.endpoints.find(item => item.id === endpointId);
    if (!endpoint) {
      throw new Error('Endpoint not found.');
    }

    const model = endpoint.testModel || state.agents.find(agent => agent.endpointId === endpointId && agent.model)?.model;
    if (!model) {
      throw new Error('Assign this endpoint to an agent and set that agent model before testing.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      this.post({ type: 'notice', level: 'info', message: `Testing ${endpoint.name}.` });
      const result = await new LlmClient(id => this.storage.getApiKey(id)).testEndpoint(endpoint, model, controller.signal);
      this.post({ type: 'notice', level: 'info', message: `Endpoint OK: ${result.text || 'connected'}` });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async attachFiles(): Promise<void> {
    const remaining = MAX_ATTACHMENTS - this.attachments.length;
    if (remaining <= 0) {
      this.post({ type: 'notice', level: 'warning', message: `Attachment limit reached (${MAX_ATTACHMENTS}).` });
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: 'Attach'
    });
    if (!uris?.length) {
      return;
    }

    const selected = uris.slice(0, remaining);
    const attachments = await Promise.all(selected.map(uri => this.readAttachment(uri)));
    this.attachments = [...this.attachments, ...attachments];
    this.post({ type: 'attachments', attachments: this.attachments });
    this.post({ type: 'notice', level: 'info', message: `${attachments.length} file(s) attached.` });
  }

  private async readAttachment(uri: vscode.Uri): Promise<ChatAttachment> {
    const stat = await vscode.workspace.fs.stat(uri);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const slice = bytes.slice(0, MAX_ATTACHMENT_BYTES);
    const binary = isLikelyBinary(slice);
    const relativePath = vscode.workspace.asRelativePath(uri, false);

    return {
      id: createId('attachment'),
      name: uri.path.split('/').pop() || relativePath,
      path: relativePath,
      size: stat.size,
      mediaType: guessMediaType(uri.path),
      binary,
      truncated: stat.size > MAX_ATTACHMENT_BYTES,
      content: binary ? undefined : Buffer.from(slice).toString('utf8')
    };
  }

  private async applyAction(actionId: string): Promise<void> {
    const action = await this.storage.getPendingAction(actionId);
    if (!action) {
      throw new Error('Action not found.');
    }
    if (action.status !== 'pending') {
      throw new Error('Only pending actions can be applied.');
    }

    const result = action.kind === 'file-edit'
      ? await applyFileEdit(action)
      : action.kind === 'file-delete'
        ? await applyFileDelete(action)
      : runApprovedTerminalCommand(action);

    await this.storage.updatePendingAction(actionId, { status: 'applied', result });
    await this.refresh();
    this.post({ type: 'notice', level: 'info', message: result });
  }

  private async exportConfig(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(this.context.globalStorageUri, 'orchestrator-config.json'),
      filters: { JSON: ['json'] },
      saveLabel: 'Export'
    });
    if (!uri) {
      return;
    }

    const state = await this.storage.exportState();
    const json = JSON.stringify({ ...state, note: 'API keys are intentionally not exported.' }, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
    this.post({ type: 'notice', level: 'info', message: 'Configuration exported without API keys.' });
  }

  private async importConfig(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: 'Import'
    });
    const uri = uris?.[0];
    if (!uri) {
      return;
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    await this.storage.importState(JSON.parse(Buffer.from(bytes).toString('utf8')));
    await this.refresh();
    this.post({ type: 'notice', level: 'info', message: 'Configuration imported. Re-enter endpoint API keys as needed.' });
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private render(webview: vscode.Webview): string {
    const nonce = getNonce();
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );
    return renderWebviewHtml(codiconsUri.toString(), nonce, webview.cspSource);
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function createAttachmentContext(attachments: ChatAttachment[]): string {
  if (attachments.length === 0) {
    return 'Attached files: none.';
  }

  return [
    'Attached files:',
    ...attachments.map(attachment => [
      `--- ${attachment.path} (${attachment.mediaType}, ${attachment.size} bytes${attachment.truncated ? ', truncated' : ''}) ---`,
      attachment.binary
        ? '[Binary file attached. Content is not embedded in the prompt yet; use the filename and metadata only.]'
        : attachment.content || ''
    ].join('\n'))
  ].join('\n\n');
}

function isLikelyBinary(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, Math.min(bytes.length, 2048));
  return sample.some(byte => byte === 0);
}

function guessMediaType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'md':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'css':
    case 'html':
    case 'txt':
    case 'py':
    case 'java':
    case 'cs':
    case 'go':
    case 'rs':
    case 'yaml':
    case 'yml':
      return 'text/plain';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
