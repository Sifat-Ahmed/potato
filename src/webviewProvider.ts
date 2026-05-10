import * as vscode from 'vscode';
import { LlmClient } from './llmClient';
import { OrchestratorRuntime } from './orchestrator';
import { OrchestratorStorage } from './storage';
import { ToolRunner } from './toolRunner';
import { ExtensionToWebviewMessage, OrchestratorRunUpdate, RunHistoryEntry, WebviewToExtensionMessage } from './types';
import { asErrorMessage, createId } from './utils';
import { renderWebviewHtml } from './webviewHtml';
import { applyFileEdit, runApprovedTerminalCommand } from './workspaceActions';
import { createWorkspaceContext } from './workspaceContext';

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
  userText: string;
  updates: OrchestratorRunUpdate[];
}

export class OrchestratorWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'orchestrator.workbench';

  private view?: vscode.WebviewView;
  private activeRun?: ActiveRun;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: OrchestratorStorage,
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
    this.output.appendLine('Orchestrator webview resolved.');
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand('orchestrator.workbench.focus');
  }

  async refresh(): Promise<void> {
    const state = await this.storage.getPublicState();
    this.post({ type: 'state', state });
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
        case 'testEndpoint':
          await this.testEndpoint(message.endpointId);
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
      this.output.appendLine(`Webview message failed: ${asErrorMessage(error)}`);
      this.post({ type: 'notice', level: 'error', message: asErrorMessage(error) });
    }
  }

  private async runTask(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.activeRun) {
      return;
    }

    const controller = new AbortController();
    const updates: OrchestratorRunUpdate[] = [];
    this.activeRun = {
      controller,
      startedAt: Date.now(),
      userText: trimmed,
      updates
    };

    this.post({ type: 'notice', level: 'info', message: 'Run started.' });
    const state = await this.storage.getState();
    const workspaceContext = await createWorkspaceContext();
    const input = `${trimmed}\n\n${workspaceContext}`;
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
    const status = updates.some(update => update.kind === 'cancelled')
      ? 'cancelled'
      : updates.some(update => update.kind === 'error')
        ? 'failed'
        : 'completed';

    const entry: RunHistoryEntry = {
      id: createId('run'),
      userText: trimmed,
      status,
      startedAt: this.activeRun.startedAt,
      finishedAt: Date.now(),
      updates
    };
    await this.storage.addRunHistory(entry);
    this.activeRun = undefined;
    await this.refresh();
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
      throw new Error('Add a test model on the endpoint or assign an agent model before testing.');
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
    return renderWebviewHtml(codiconsUri.toString(), nonce);
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
