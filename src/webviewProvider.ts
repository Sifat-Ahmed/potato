import * as vscode from 'vscode';
import { LlmClient } from './llmClient';
import { OrchestratorRuntime } from './orchestrator';
import { OrchestratorStorage } from './storage';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './types';
import { asErrorMessage } from './utils';
import { createWorkspaceContext } from './workspaceContext';

export class OrchestratorWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'orchestrator.workbench';

  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: OrchestratorStorage
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.render(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(message => {
      void this.handleMessage(message as WebviewToExtensionMessage);
    });
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
        case 'runTask':
          await this.runTask(message.text);
          break;
      }
    } catch (error) {
      this.post({ type: 'notice', level: 'error', message: asErrorMessage(error) });
    }
  }

  private async runTask(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const state = await this.storage.getState();
    const workspaceContext = await createWorkspaceContext();
    const input = `${trimmed}\n\n${workspaceContext}`;
    const runtime = new OrchestratorRuntime(
      new LlmClient(endpointId => this.storage.getApiKey(endpointId)),
      update => this.post({ type: 'runUpdate', update })
    );

    await runtime.run(input, state.endpoints, state.agents);
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private render(webview: vscode.Webview): string {
    const nonce = getNonce();
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codiconsUri}" rel="stylesheet">
  <title>Private Orchestrator</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: var(--vscode-sideBar-background);
      --panel: color-mix(in srgb, var(--vscode-sideBar-background) 86%, var(--vscode-editor-foreground) 14%);
      --panel-2: color-mix(in srgb, var(--vscode-sideBar-background) 72%, var(--vscode-editor-foreground) 28%);
      --border: var(--vscode-widget-border, rgba(128, 128, 128, 0.32));
      --text: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accentText: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --input: var(--vscode-input-background);
      --inputBorder: var(--vscode-input-border, transparent);
      --focus: var(--vscode-focusBorder);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      border-radius: 6px;
      min-height: 30px;
      padding: 5px 9px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    button:hover {
      background: var(--panel);
    }

    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accentText);
    }

    button.icon {
      width: 30px;
      padding: 0;
      justify-content: center;
    }

    button.danger {
      color: var(--danger);
    }

    input,
    select,
    textarea {
      width: 100%;
      background: var(--input);
      border: 1px solid var(--inputBorder);
      color: var(--text);
      border-radius: 6px;
      padding: 7px 8px;
      outline: none;
    }

    textarea {
      min-height: 86px;
      resize: vertical;
    }

    input:focus,
    select:focus,
    textarea:focus,
    button:focus-visible {
      border-color: var(--focus);
      outline: 1px solid var(--focus);
      outline-offset: 0;
    }

    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .topbar {
      padding: 14px 14px 10px;
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .brand-title {
      font-weight: 650;
      letter-spacing: 0;
    }

    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }

    .tab {
      justify-content: center;
      min-width: 0;
      color: var(--muted);
    }

    .tab.active {
      background: var(--panel);
      color: var(--text);
      border-color: var(--panel-2);
    }

    .content {
      flex: 1;
      overflow: auto;
      padding: 14px;
    }

    .section {
      display: none;
    }

    .section.active {
      display: grid;
      gap: 12px;
    }

    .stack {
      display: grid;
      gap: 10px;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .row > * {
      min-width: 0;
    }

    .row.split {
      justify-content: space-between;
    }

    .field {
      display: grid;
      gap: 5px;
    }

    .field label,
    .hint,
    .meta {
      color: var(--muted);
      font-size: 12px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: color-mix(in srgb, var(--bg) 88%, var(--text) 12%);
    }

    .item-title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--panel);
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .composer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: end;
      position: sticky;
      bottom: 0;
      background: var(--bg);
      padding-top: 8px;
    }

    .composer textarea {
      min-height: 74px;
    }

    .transcript {
      display: grid;
      gap: 10px;
      min-height: 120px;
    }

    .message {
      border-left: 2px solid var(--border);
      padding: 2px 0 2px 10px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .message.final {
      border-left-color: var(--accent);
    }

    .message.error {
      border-left-color: var(--danger);
      color: var(--danger);
    }

    .message-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }

    .empty {
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }

    .notice {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 9px 10px;
      background: var(--panel);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      display: none;
      overflow-wrap: anywhere;
    }

    .notice.show {
      display: block;
    }

    @media (max-width: 300px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }

      .tabs {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div>
          <div class="brand-title">Private Orchestrator</div>
          <div class="meta" id="summary">No endpoints configured</div>
        </div>
        <button class="icon" id="refresh" title="Refresh" aria-label="Refresh">
          <span class="codicon codicon-refresh"></span>
        </button>
      </div>
      <nav class="tabs" aria-label="Sections">
        <button class="tab active" data-tab="chat">Chat</button>
        <button class="tab" data-tab="agents">Agents</button>
        <button class="tab" data-tab="endpoints">Endpoints</button>
      </nav>
    </header>

    <main class="content">
      <section class="section active" id="chat">
        <div class="transcript" id="transcript">
          <div class="empty">Configure an endpoint, assign it to the manager, then run a task.</div>
        </div>
        <div class="composer">
          <textarea id="taskInput" placeholder="Ask the manager to plan, research, code, or review..."></textarea>
          <button class="primary icon" id="runTask" title="Run task" aria-label="Run task">
            <span class="codicon codicon-send"></span>
          </button>
        </div>
      </section>

      <section class="section" id="agents">
        <div class="row split">
          <div>
            <div class="item-title">Agents</div>
            <div class="hint">Roles and model bindings</div>
          </div>
          <button id="newAgent">
            <span class="codicon codicon-add"></span>
            New
          </button>
        </div>
        <div class="stack" id="agentList"></div>
        <form class="stack item" id="agentForm">
          <input type="hidden" id="agentId">
          <div class="field">
            <label for="agentName">Name</label>
            <input id="agentName" required>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="agentRole">Role</label>
              <select id="agentRole">
                <option value="manager">Manager</option>
                <option value="research">Research</option>
                <option value="web-search">Web search</option>
                <option value="coding">Coding</option>
                <option value="review">Review</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div class="field">
              <label for="agentEnabled">State</label>
              <select id="agentEnabled">
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="agentEndpoint">Endpoint</label>
            <select id="agentEndpoint"></select>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="agentModel">Model</label>
              <input id="agentModel" placeholder="deployment or model id">
            </div>
            <div class="field">
              <label for="agentTemperature">Temperature</label>
              <input id="agentTemperature" type="number" min="0" max="2" step="0.05" placeholder="0.2">
            </div>
          </div>
          <div class="field">
            <label for="agentPrompt">System prompt</label>
            <textarea id="agentPrompt" required></textarea>
          </div>
          <div class="row">
            <button class="primary" type="submit">
              <span class="codicon codicon-save"></span>
              Save
            </button>
            <button type="button" id="deleteAgent" class="danger">
              <span class="codicon codicon-trash"></span>
              Delete
            </button>
          </div>
        </form>
      </section>

      <section class="section" id="endpoints">
        <div class="row split">
          <div>
            <div class="item-title">Endpoints</div>
            <div class="hint">OpenAI-compatible bases</div>
          </div>
          <button id="newEndpoint">
            <span class="codicon codicon-add"></span>
            New
          </button>
        </div>
        <div class="stack" id="endpointList"></div>
        <form class="stack item" id="endpointForm">
          <input type="hidden" id="endpointId">
          <div class="field">
            <label for="endpointName">Name</label>
            <input id="endpointName" required>
          </div>
          <div class="field">
            <label for="endpointBaseUrl">Base URL</label>
            <input id="endpointBaseUrl" placeholder="https://host.example.com/v1" required>
            <div class="hint">The extension appends the selected API route unless the URL already includes one.</div>
          </div>
          <div class="field">
            <label for="endpointPath">Path override</label>
            <input id="endpointPath" placeholder="/chat/completions, /responses, or /completions">
            <div class="hint">Use this when the endpoint needs a custom route after the base URL.</div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="endpointKind">API kind</label>
              <select id="endpointKind">
                <option value="chat-completions">Chat completions</option>
                <option value="responses">Responses</option>
                <option value="completions">Completions</option>
              </select>
            </div>
            <div class="field">
              <label for="endpointAuth">Auth</label>
              <select id="endpointAuth">
                <option value="bearer">Bearer token</option>
                <option value="api-key">api-key header</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="endpointApiVersion">API version</label>
              <input id="endpointApiVersion" placeholder="optional">
            </div>
            <div class="field">
              <label for="endpointOrganization">Organization</label>
              <input id="endpointOrganization" placeholder="optional">
            </div>
          </div>
          <div class="field">
            <label for="endpointApiKey">API key</label>
            <input id="endpointApiKey" type="password" placeholder="Leave blank to keep existing key">
          </div>
          <div class="field">
            <label for="endpointHeaders">Default headers JSON</label>
            <textarea id="endpointHeaders" placeholder='{"x-custom-header":"value"}'></textarea>
          </div>
          <div class="row">
            <button class="primary" type="submit">
              <span class="codicon codicon-save"></span>
              Save
            </button>
            <button type="button" id="deleteEndpoint" class="danger">
              <span class="codicon codicon-trash"></span>
              Delete
            </button>
          </div>
        </form>
      </section>
    </main>
  </div>
  <div class="notice" id="notice"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = {
      endpoints: [],
      agents: [],
      activeTab: 'chat'
    };

    const $ = (id) => document.getElementById(id);

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'state') {
        state.endpoints = message.state.endpoints;
        state.agents = message.state.agents;
        renderAll();
      }
      if (message.type === 'runUpdate') {
        appendRunUpdate(message.update);
      }
      if (message.type === 'notice') {
        showNotice(message.message, message.level);
      }
    });

    document.querySelectorAll('.tab').forEach(button => {
      button.addEventListener('click', () => setTab(button.dataset.tab));
    });

    $('refresh').addEventListener('click', () => vscode.postMessage({ type: 'ready' }));
    $('runTask').addEventListener('click', runTask);
    $('taskInput').addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        runTask();
      }
    });

    $('newAgent').addEventListener('click', () => editAgent());
    $('newEndpoint').addEventListener('click', () => editEndpoint());
    $('deleteAgent').addEventListener('click', () => {
      const agentId = $('agentId').value;
      if (agentId) {
        vscode.postMessage({ type: 'deleteAgent', agentId });
        editAgent();
      }
    });
    $('deleteEndpoint').addEventListener('click', () => {
      const endpointId = $('endpointId').value;
      if (endpointId) {
        vscode.postMessage({ type: 'deleteEndpoint', endpointId });
        editEndpoint();
      }
    });

    $('agentForm').addEventListener('submit', event => {
      event.preventDefault();
      vscode.postMessage({
        type: 'saveAgent',
        agent: {
          id: $('agentId').value || createId('agent'),
          name: $('agentName').value.trim(),
          role: $('agentRole').value,
          endpointId: $('agentEndpoint').value || undefined,
          model: $('agentModel').value.trim() || undefined,
          systemPrompt: $('agentPrompt').value.trim(),
          temperature: $('agentTemperature').value === '' ? undefined : Number($('agentTemperature').value),
          enabled: $('agentEnabled').value === 'true'
        }
      });
    });

    $('endpointForm').addEventListener('submit', event => {
      event.preventDefault();
      let defaultHeaders;
      const headersText = $('endpointHeaders').value.trim();
      if (headersText) {
        try {
          defaultHeaders = JSON.parse(headersText);
        } catch {
          showNotice('Default headers must be valid JSON.', 'error');
          return;
        }
      }

      vscode.postMessage({
        type: 'saveEndpoint',
        endpoint: {
          id: $('endpointId').value || createId('endpoint'),
          name: $('endpointName').value.trim(),
          baseUrl: $('endpointBaseUrl').value.trim(),
          apiKind: $('endpointKind').value,
          apiPath: $('endpointPath').value.trim() || undefined,
          authMode: $('endpointAuth').value,
          apiVersion: $('endpointApiVersion').value.trim() || undefined,
          organization: $('endpointOrganization').value.trim() || undefined,
          defaultHeaders
        },
        apiKey: $('endpointApiKey').value
      });
      $('endpointApiKey').value = '';
    });

    function setTab(tab) {
      state.activeTab = tab;
      document.querySelectorAll('.tab').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tab);
      });
      document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === tab);
      });
    }

    function renderAll() {
      $('summary').textContent = state.endpoints.length + ' endpoint' + (state.endpoints.length === 1 ? '' : 's') + ', ' +
        state.agents.length + ' agent' + (state.agents.length === 1 ? '' : 's');
      renderEndpointOptions();
      renderAgents();
      renderEndpoints();

      if (!$('agentId').value && state.agents[0]) {
        editAgent(state.agents[0]);
      }
      if (!$('endpointId').value && state.endpoints[0]) {
        editEndpoint(state.endpoints[0]);
      }
    }

    function renderEndpointOptions() {
      const select = $('agentEndpoint');
      const selected = select.value;
      select.innerHTML = '<option value="">No endpoint</option>' + state.endpoints.map(endpoint =>
        '<option value="' + escapeHtml(endpoint.id) + '">' + escapeHtml(endpoint.name) + '</option>'
      ).join('');
      select.value = selected;
    }

    function renderAgents() {
      const list = $('agentList');
      if (!state.agents.length) {
        list.innerHTML = '<div class="empty">No agents yet.</div>';
        return;
      }

      list.innerHTML = state.agents.map(agent => {
        const endpoint = state.endpoints.find(item => item.id === agent.endpointId);
        return '<button class="item" data-agent-id="' + escapeHtml(agent.id) + '">' +
          '<div class="row split"><span class="item-title">' + escapeHtml(agent.name) + '</span><span class="badge">' + escapeHtml(agent.role) + '</span></div>' +
          '<div class="meta">' + escapeHtml(endpoint?.name || 'No endpoint') + ' · ' + escapeHtml(agent.model || 'No model') + '</div>' +
        '</button>';
      }).join('');

      list.querySelectorAll('[data-agent-id]').forEach(button => {
        button.addEventListener('click', () => editAgent(state.agents.find(agent => agent.id === button.dataset.agentId)));
      });
    }

    function renderEndpoints() {
      const list = $('endpointList');
      if (!state.endpoints.length) {
        list.innerHTML = '<div class="empty">No endpoints yet.</div>';
        return;
      }

      list.innerHTML = state.endpoints.map(endpoint =>
        '<button class="item" data-endpoint-id="' + escapeHtml(endpoint.id) + '">' +
          '<div class="row split"><span class="item-title">' + escapeHtml(endpoint.name) + '</span><span class="badge">' + escapeHtml(endpoint.apiKind) + '</span></div>' +
          '<div class="meta">' + escapeHtml(endpoint.baseUrl) + '</div>' +
          '<div class="meta">' + escapeHtml(endpoint.authMode) + ' · ' + (endpoint.hasApiKey ? 'key stored' : 'no key') + '</div>' +
        '</button>'
      ).join('');

      list.querySelectorAll('[data-endpoint-id]').forEach(button => {
        button.addEventListener('click', () => editEndpoint(state.endpoints.find(endpoint => endpoint.id === button.dataset.endpointId)));
      });
    }

    function editAgent(agent) {
      $('agentId').value = agent?.id || '';
      $('agentName').value = agent?.name || '';
      $('agentRole').value = agent?.role || 'custom';
      $('agentEnabled').value = String(agent?.enabled ?? true);
      $('agentEndpoint').value = agent?.endpointId || '';
      $('agentModel').value = agent?.model || '';
      $('agentTemperature').value = agent?.temperature ?? '';
      $('agentPrompt').value = agent?.systemPrompt || '';
    }

    function editEndpoint(endpoint) {
      $('endpointId').value = endpoint?.id || '';
      $('endpointName').value = endpoint?.name || '';
      $('endpointBaseUrl').value = endpoint?.baseUrl || '';
      $('endpointPath').value = endpoint?.apiPath || '';
      $('endpointKind').value = endpoint?.apiKind || 'chat-completions';
      $('endpointAuth').value = endpoint?.authMode || 'bearer';
      $('endpointApiVersion').value = endpoint?.apiVersion || '';
      $('endpointOrganization').value = endpoint?.organization || '';
      $('endpointApiKey').value = '';
      $('endpointHeaders').value = endpoint?.defaultHeaders ? JSON.stringify(endpoint.defaultHeaders, null, 2) : '';
    }

    function runTask() {
      const text = $('taskInput').value.trim();
      if (!text) {
        return;
      }
      const transcript = $('transcript');
      transcript.innerHTML = '';
      appendMessage('User', text);
      vscode.postMessage({ type: 'runTask', text });
    }

    function appendRunUpdate(update) {
      if (update.kind === 'status') {
        appendMessage('Status', update.message);
      } else if (update.kind === 'plan') {
        appendMessage('Plan', update.message);
      } else if (update.kind === 'agent-result') {
        appendMessage(update.result?.agentName || 'Agent', update.message);
      } else if (update.kind === 'final') {
        appendMessage('Manager', update.message, 'final');
      } else if (update.kind === 'error') {
        appendMessage('Error', update.message, 'error');
      }
    }

    function appendMessage(label, body, extraClass) {
      const transcript = $('transcript');
      const node = document.createElement('div');
      node.className = 'message ' + (extraClass || '');
      node.innerHTML = '<div class="message-label">' + escapeHtml(label) + '</div>' + escapeHtml(body);
      transcript.appendChild(node);
      node.scrollIntoView({ block: 'end' });
    }

    function showNotice(message, level) {
      const notice = $('notice');
      notice.textContent = message;
      notice.className = 'notice show ' + (level || 'info');
      clearTimeout(showNotice.timer);
      showNotice.timer = setTimeout(() => {
        notice.className = 'notice';
      }, 3200);
    }

    function createId(prefix) {
      return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
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
