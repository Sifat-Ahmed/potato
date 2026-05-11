export function renderWebviewHtml(codiconsUri: string, nonce: string, cspSource: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource}; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <link href="${codiconsUri}" rel="stylesheet">
  <title>Potato</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: dark;
      --bg: var(--vscode-sideBar-background);
      --panel: var(--vscode-editorWidget-background);
      --border: var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
      --text: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accentText: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --input: var(--vscode-input-background);
      --inputBorder: var(--vscode-input-border, transparent);
      --focus: var(--vscode-focusBorder);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }
    button, input, select, textarea { font: inherit; }
    button {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      border-radius: 6px;
      min-height: 30px;
      padding: 5px 9px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
    }
    button:hover { background: var(--panel); }
    button.primary { background: var(--accent); border-color: var(--accent); color: var(--accentText); }
    button.icon { width: 30px; padding: 0; }
    button.danger { color: var(--danger); }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    input, select, textarea {
      width: 100%;
      background: var(--input);
      border: 1px solid var(--inputBorder);
      color: var(--text);
      border-radius: 6px;
      padding: 7px 8px;
      outline: none;
    }
    textarea { min-height: 86px; resize: vertical; }
    input:focus, select:focus, textarea:focus, button:focus-visible {
      border-color: var(--focus);
      outline: 1px solid var(--focus);
      outline-offset: 0;
    }
    .shell { height: 100vh; min-height: 0; display: flex; flex-direction: column; }
    .topbar { padding: 10px 12px; border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .brand-title { font-weight: 650; letter-spacing: 0; }
    .toolbar { position: relative; flex: 0 0 auto; }
    .toolbar button.active { background: var(--panel); color: var(--text); }
    .menu-popover {
      position: absolute;
      top: 36px;
      right: 0;
      z-index: 20;
      width: min(220px, calc(100vw - 24px));
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px;
      background: var(--panel);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
    }
    .menu-popover[hidden] { display: none; }
    .menu-item {
      width: 100%;
      border-color: transparent;
      justify-content: flex-start;
      min-height: 32px;
      padding: 6px 8px;
    }
    .menu-item.active { background: color-mix(in srgb, var(--panel) 70%, var(--text) 12%); color: var(--text); }
    .menu-item .codicon { width: 16px; }
    .menu-separator { height: 1px; background: var(--border); margin: 6px; }
    .count {
      margin-left: auto;
      min-width: 18px;
      height: 18px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      color: var(--muted);
      font-size: 11px;
    }
    .content { flex: 1; min-height: 0; overflow: auto; padding: 14px; }
    .section { display: none; }
    .section.active { display: grid; gap: 12px; }
    #chat.section.active { min-height: 100%; display: flex; flex-direction: column; }
    .stack { display: grid; gap: 10px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .row > * { min-width: 0; }
    .row.split { justify-content: space-between; }
    .field { display: grid; gap: 5px; }
    .field label, .hint, .meta { color: var(--muted); font-size: 12px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: color-mix(in srgb, var(--bg) 90%, var(--text) 10%);
      text-align: left;
    }
    .item-title { font-weight: 600; overflow-wrap: anywhere; }
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
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg);
      border-top: 1px solid var(--border);
      padding: 10px 12px 12px;
      z-index: 10;
    }
    .composer-card {
      display: grid;
      gap: 8px;
      border: 1px solid var(--inputBorder);
      border-radius: 8px;
      background: var(--input);
      padding: 8px;
    }
    .input-row {
      display: grid;
      grid-template-columns: 30px 1fr 30px 30px;
      gap: 8px;
      align-items: end;
    }
    .secret-row {
      display: grid;
      grid-template-columns: 1fr 30px;
      gap: 8px;
      align-items: center;
    }
    .composer textarea {
      min-height: 104px;
      max-height: 220px;
      border: 0;
      background: transparent;
      padding: 4px 0;
      resize: vertical;
    }
    .composer textarea:focus {
      border-color: transparent;
      outline: none;
    }
    .attachment-tray {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      min-height: 26px;
      padding: 3px 6px;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--muted);
      background: var(--bg);
      font-size: 12px;
    }
    .attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .attachment-remove {
      width: 20px;
      min-height: 20px;
      padding: 0;
      border: 0;
    }
    .composer-footer {
      color: var(--muted);
      font-size: 11px;
      text-align: center;
      line-height: 1.2;
    }
    .transcript, .history, .actions { display: grid; gap: 10px; min-height: 120px; align-content: start; }
    .transcript { flex: 1; padding-bottom: 190px; }
    .message {
      border-left: 2px solid var(--border);
      padding: 2px 0 2px 10px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .message.final { border-left-color: var(--accent); }
    .message.error { border-left-color: var(--danger); color: var(--danger); }
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
      bottom: 178px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 9px 10px;
      background: var(--panel);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      display: none;
      overflow-wrap: anywhere;
    }
    .notice.show { display: block; }
    @media (max-width: 420px) {
      .grid-2 { grid-template-columns: 1fr; }
      .brand { align-items: flex-start; }
      .input-row { grid-template-columns: 30px 1fr 30px 30px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div>
          <div class="brand-title">Potato</div>
          <div class="meta" id="summary">Loading</div>
        </div>
        <div class="row toolbar">
          <button class="icon" id="historyButton" title="History" aria-label="History"><span class="codicon codicon-history"></span></button>
          <button class="icon" id="menuButton" title="Settings and sections" aria-label="Settings and sections" aria-expanded="false"><span class="codicon codicon-settings-gear"></span></button>
          <div class="menu-popover" id="settingsMenu" hidden>
            <button class="menu-item active" data-tab="chat"><span class="codicon codicon-comment-discussion"></span>Chat</button>
            <button class="menu-item" data-tab="agents"><span class="codicon codicon-organization"></span>Agents</button>
            <button class="menu-item" data-tab="endpoints"><span class="codicon codicon-plug"></span>Endpoints</button>
            <button class="menu-item" data-tab="actions"><span class="codicon codicon-checklist"></span>Actions<span class="count" id="actionCount">0</span></button>
            <div class="menu-separator"></div>
            <button class="menu-item" id="importConfig"><span class="codicon codicon-cloud-download"></span>Import config</button>
            <button class="menu-item" id="exportConfig"><span class="codicon codicon-cloud-upload"></span>Export config</button>
            <button class="menu-item" id="refresh"><span class="codicon codicon-refresh"></span>Refresh</button>
          </div>
        </div>
      </div>
    </header>

    <main class="content">
      <section class="section active" id="chat">
        <div class="transcript" id="transcript">
          <div class="empty">Configure an endpoint, assign it to the manager, then run a task.</div>
        </div>
        <div class="composer">
          <div class="composer-card">
            <div class="attachment-tray" id="attachmentTray" hidden></div>
            <div class="input-row">
              <button class="icon" id="attachFiles" title="Attach files" aria-label="Attach files"><span class="codicon codicon-add"></span></button>
              <textarea id="taskInput" placeholder="Ask the manager to plan, research, code, or review..."></textarea>
              <button class="primary icon" id="runTask" title="Run task" aria-label="Run task"><span class="codicon codicon-send"></span></button>
              <button class="icon" id="cancelRun" title="Stop run" aria-label="Stop run" disabled><span class="codicon codicon-debug-stop"></span></button>
            </div>
          </div>
          <div class="composer-footer">All rights reserved, Sifat Ahmed</div>
        </div>
      </section>

      <section class="section" id="agents">
        <div class="row split">
          <div><div class="item-title">Agents</div><div class="hint">Roles and model bindings</div></div>
          <button id="newAgent"><span class="codicon codicon-add"></span>New</button>
        </div>
        <div class="stack" id="agentList"></div>
        <form class="stack item" id="agentForm">
          <input type="hidden" id="agentId">
          <div class="field"><label for="agentName">Name</label><input id="agentName" required></div>
          <div class="grid-2">
            <div class="field"><label for="agentRole">Role</label><select id="agentRole"><option value="manager">Manager</option><option value="research">Research</option><option value="web-search">Web search</option><option value="coding">Coding</option><option value="review">Review</option><option value="custom">Custom</option></select></div>
            <div class="field"><label for="agentEnabled">State</label><select id="agentEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
          </div>
          <div class="field"><label for="agentEndpoint">Endpoint</label><select id="agentEndpoint"></select></div>
          <div class="grid-2">
            <div class="field"><label for="agentModel">Model</label><input id="agentModel" placeholder="deployment or model id"></div>
            <div class="field"><label for="agentTemperature">Temperature</label><input id="agentTemperature" type="number" min="0" max="2" step="0.05" placeholder="0.2"></div>
          </div>
          <div class="field"><label for="agentPrompt">System prompt</label><textarea id="agentPrompt" required></textarea></div>
          <div class="row"><button class="primary" type="submit"><span class="codicon codicon-save"></span>Save</button><button type="button" id="deleteAgent" class="danger"><span class="codicon codicon-trash"></span>Delete</button></div>
        </form>
      </section>

      <section class="section" id="endpoints">
        <div class="row split">
          <div><div class="item-title">Endpoints</div><div class="hint">OpenAI-compatible bases</div></div>
          <button id="newEndpoint"><span class="codicon codicon-add"></span>New</button>
        </div>
        <div class="stack" id="endpointList"></div>
        <form class="stack item" id="endpointForm">
          <input type="hidden" id="endpointId">
          <div class="row"><button type="button" id="azurePreset">Azure preset</button><button type="button" id="openAiPreset">OpenAI preset</button></div>
          <div class="field"><label for="endpointName">Name</label><input id="endpointName" required></div>
          <div class="field"><label for="endpointBaseUrl">Base URL</label><input id="endpointBaseUrl" placeholder="https://apim.example.com/team/openai" required><div class="hint">For Azure/APIM, paste through /openai and put the deployment in Model/Test model. Full request URLs also work.</div></div>
          <div class="field"><label for="endpointPath">Path override</label><input id="endpointPath" placeholder="/deployments/model/chat/completions or leave blank"></div>
          <div class="grid-2">
            <div class="field"><label for="endpointKind">API kind</label><select id="endpointKind"><option value="chat-completions">Chat completions</option><option value="responses">Responses</option><option value="completions">Completions</option></select></div>
            <div class="field"><label for="endpointAuth">Auth</label><select id="endpointAuth"><option value="bearer">Bearer token</option><option value="api-key">api-key header</option><option value="none">None</option></select></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="endpointStreaming">Streaming</label><select id="endpointStreaming"><option value="false">Off</option><option value="true">On if supported</option></select></div>
            <div class="field"><label for="endpointTestModel">Test model</label><input id="endpointTestModel" placeholder="optional model/deployment"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="endpointApiVersion">API version</label><input id="endpointApiVersion" placeholder="optional"></div>
            <div class="field"><label for="endpointOrganization">Organization</label><input id="endpointOrganization" placeholder="optional"></div>
          </div>
          <div class="field">
            <label for="endpointApiKey">API key</label>
            <div class="secret-row">
              <input id="endpointApiKey" type="password" placeholder="Saved locally after Save or Test">
              <button type="button" class="icon" id="toggleEndpointApiKey" title="Show saved API key" aria-label="Show saved API key"><span class="codicon codicon-eye"></span></button>
            </div>
            <div class="hint">Saved in VS Code SecretStorage. Test saves the current key before calling the endpoint.</div>
          </div>
          <div class="field"><label for="endpointHeaders">Default headers JSON</label><textarea id="endpointHeaders" placeholder='{"x-custom-header":"value"}'></textarea></div>
          <div class="row"><button class="primary" type="submit"><span class="codicon codicon-save"></span>Save</button><button type="button" id="testEndpoint"><span class="codicon codicon-beaker"></span>Test</button><button type="button" id="deleteEndpoint" class="danger"><span class="codicon codicon-trash"></span>Delete</button></div>
        </form>
      </section>

      <section class="section" id="actions">
        <div><div class="item-title">Approval Queue</div><div class="hint">File edits and terminal commands stay here until approved.</div></div>
        <div class="actions" id="actionList"></div>
      </section>

      <section class="section" id="history">
        <div><div class="item-title">Run History</div><div class="hint">Last 50 runs are stored locally.</div></div>
        <div class="history" id="historyList"></div>
      </section>
    </main>
  </div>
  <div class="notice" id="notice"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = { endpoints: [], agents: [], pendingActions: [], runHistory: [], attachments: [], activeTab: 'chat', running: false, streamNode: null };
    const $ = (id) => document.getElementById(id);

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'state') {
        state.endpoints = message.state.endpoints || [];
        state.agents = message.state.agents || [];
        state.pendingActions = message.state.pendingActions || [];
        state.runHistory = message.state.runHistory || [];
        renderAll();
      }
      if (message.type === 'attachments') {
        state.attachments = message.attachments || [];
        renderAttachments();
      }
      if (message.type === 'endpointKey') {
        handleEndpointKey(message);
      }
      if (message.type === 'runUpdate') appendRunUpdate(message.update);
      if (message.type === 'notice') showNotice(message.message, message.level);
    });

    document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
      setTab(button.dataset.tab);
      closeMenu();
    }));
    $('historyButton').addEventListener('click', () => {
      setTab('history');
      closeMenu();
    });
    $('menuButton').addEventListener('click', event => {
      event.stopPropagation();
      toggleMenu();
    });
    document.addEventListener('click', event => {
      if (!$('settingsMenu').hidden && !event.target.closest('#settingsMenu') && !event.target.closest('#menuButton')) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
    $('refresh').addEventListener('click', () => vscode.postMessage({ type: 'ready' }));
    $('importConfig').addEventListener('click', () => vscode.postMessage({ type: 'importConfig' }));
    $('exportConfig').addEventListener('click', () => vscode.postMessage({ type: 'exportConfig' }));
    $('runTask').addEventListener('click', runTask);
    $('cancelRun').addEventListener('click', () => vscode.postMessage({ type: 'cancelRun' }));
    $('attachFiles').addEventListener('click', () => vscode.postMessage({ type: 'attachFiles' }));
    $('taskInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        runTask();
      }
    });
    $('newAgent').addEventListener('click', () => editAgent());
    $('newEndpoint').addEventListener('click', () => editEndpoint());
    $('azurePreset').addEventListener('click', () => {
      $('endpointKind').value = 'chat-completions';
      $('endpointAuth').value = 'api-key';
      $('endpointApiVersion').value = $('endpointApiVersion').value || '2024-02-15-preview';
      $('endpointPath').value = '';
    });
    $('openAiPreset').addEventListener('click', () => {
      $('endpointKind').value = 'chat-completions';
      $('endpointAuth').value = 'bearer';
      $('endpointPath').value = '';
    });
    $('testEndpoint').addEventListener('click', () => {
      const payload = readEndpointForm();
      if (!payload) return;
      vscode.postMessage({ type: 'saveAndTestEndpoint', endpoint: payload.endpoint, apiKey: payload.apiKey });
      $('endpointId').value = payload.endpoint.id;
    });
    $('toggleEndpointApiKey').addEventListener('click', () => toggleEndpointApiKey());
    $('deleteAgent').addEventListener('click', () => {
      const agentId = $('agentId').value;
      if (agentId) vscode.postMessage({ type: 'deleteAgent', agentId });
      editAgent();
    });
    $('deleteEndpoint').addEventListener('click', () => {
      const endpointId = $('endpointId').value;
      if (endpointId) vscode.postMessage({ type: 'deleteEndpoint', endpointId });
      editEndpoint();
    });

    $('agentForm').addEventListener('submit', event => {
      event.preventDefault();
      vscode.postMessage({ type: 'saveAgent', agent: {
        id: $('agentId').value || createId('agent'),
        name: $('agentName').value.trim(),
        role: $('agentRole').value,
        endpointId: $('agentEndpoint').value || undefined,
        model: $('agentModel').value.trim() || undefined,
        systemPrompt: $('agentPrompt').value.trim(),
        temperature: $('agentTemperature').value === '' ? undefined : Number($('agentTemperature').value),
        enabled: $('agentEnabled').value === 'true'
      }});
    });

    $('endpointForm').addEventListener('submit', event => {
      event.preventDefault();
      const payload = readEndpointForm();
      if (!payload) return;
      vscode.postMessage({ type: 'saveEndpoint', endpoint: payload.endpoint, apiKey: payload.apiKey });
      $('endpointId').value = payload.endpoint.id;
    });

    function readEndpointForm() {
      if (!$('endpointForm').reportValidity()) return undefined;
      let defaultHeaders;
      const headersText = $('endpointHeaders').value.trim();
      if (headersText) {
        try { defaultHeaders = JSON.parse(headersText); }
        catch { showNotice('Default headers must be valid JSON.', 'error'); return; }
      }

      return {
        endpoint: {
          id: $('endpointId').value || createId('endpoint'),
          name: $('endpointName').value.trim(),
          baseUrl: $('endpointBaseUrl').value.trim(),
          apiKind: $('endpointKind').value,
          apiPath: $('endpointPath').value.trim() || undefined,
          authMode: $('endpointAuth').value,
          streaming: $('endpointStreaming').value === 'true',
          testModel: $('endpointTestModel').value.trim() || undefined,
          apiVersion: $('endpointApiVersion').value.trim() || undefined,
          organization: $('endpointOrganization').value.trim() || undefined,
          defaultHeaders
        },
        apiKey: $('endpointApiKey').value
      };
    }

    function setTab(tab) {
      state.activeTab = tab;
      document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
      $('historyButton').classList.toggle('active', tab === 'history');
      $('menuButton').classList.toggle('active', ['agents', 'endpoints', 'actions'].includes(tab));
      document.querySelectorAll('.section').forEach(section => section.classList.toggle('active', section.id === tab));
    }

    function toggleMenu() {
      const menu = $('settingsMenu');
      const nextOpen = menu.hidden;
      menu.hidden = !nextOpen;
      $('menuButton').setAttribute('aria-expanded', String(nextOpen));
    }

    function closeMenu() {
      $('settingsMenu').hidden = true;
      $('menuButton').setAttribute('aria-expanded', 'false');
    }

    function renderAll() {
      $('summary').textContent = state.endpoints.length + ' endpoint' + (state.endpoints.length === 1 ? '' : 's') + ', ' + state.agents.length + ' agent' + (state.agents.length === 1 ? '' : 's') + ', ' + pendingCount() + ' pending';
      $('actionCount').textContent = String(pendingCount());
      renderEndpointOptions();
      renderAgents();
      renderEndpoints();
      renderActions();
      renderHistory();
      renderAttachments();
      if (!$('agentId').value && state.agents[0]) editAgent(state.agents[0]);
      if (!$('endpointId').value && state.endpoints[0]) editEndpoint(state.endpoints[0]);
    }

    function pendingCount() { return state.pendingActions.filter(action => action.status === 'pending').length; }

    function renderEndpointOptions() {
      const select = $('agentEndpoint');
      const selected = select.value;
      select.innerHTML = '<option value="">No endpoint</option>' + state.endpoints.map(endpoint => '<option value="' + escapeHtml(endpoint.id) + '">' + escapeHtml(endpoint.name) + '</option>').join('');
      select.value = selected;
    }

    function renderAgents() {
      const list = $('agentList');
      if (!state.agents.length) { list.innerHTML = '<div class="empty">No agents yet.</div>'; return; }
      list.innerHTML = state.agents.map(agent => {
        const endpoint = state.endpoints.find(item => item.id === agent.endpointId);
        return '<button class="item" data-agent-id="' + escapeHtml(agent.id) + '"><div class="row split"><span class="item-title">' + escapeHtml(agent.name) + '</span><span class="badge">' + escapeHtml(agent.role) + '</span></div><div class="meta">' + escapeHtml(endpoint?.name || 'No endpoint') + ' · ' + escapeHtml(agent.model || 'No model') + '</div></button>';
      }).join('');
      list.querySelectorAll('[data-agent-id]').forEach(button => button.addEventListener('click', () => editAgent(state.agents.find(agent => agent.id === button.dataset.agentId))));
    }

    function renderEndpoints() {
      const list = $('endpointList');
      if (!state.endpoints.length) { list.innerHTML = '<div class="empty">No endpoints yet.</div>'; return; }
      list.innerHTML = state.endpoints.map(endpoint => '<button class="item" data-endpoint-id="' + escapeHtml(endpoint.id) + '"><div class="row split"><span class="item-title">' + escapeHtml(endpoint.name) + '</span><span class="badge">' + escapeHtml(endpoint.apiKind) + '</span></div><div class="meta">' + escapeHtml(endpoint.baseUrl) + '</div><div class="meta">' + escapeHtml(endpoint.authMode) + ' · ' + (endpoint.streaming ? 'streaming' : 'no streaming') + ' · ' + (endpoint.hasApiKey ? 'key stored' : 'no key') + '</div></button>').join('');
      list.querySelectorAll('[data-endpoint-id]').forEach(button => button.addEventListener('click', () => editEndpoint(state.endpoints.find(endpoint => endpoint.id === button.dataset.endpointId))));
    }

    function renderActions() {
      const list = $('actionList');
      if (!state.pendingActions.length) { list.innerHTML = '<div class="empty">No proposed actions yet.</div>'; return; }
      list.innerHTML = state.pendingActions.map(action => {
        const detail = action.kind === 'file-edit' ? action.fileEdit?.path : action.terminalCommand?.command;
        const buttons = action.status === 'pending' ? '<div class="row"><button class="primary" data-apply="' + escapeHtml(action.id) + '"><span class="codicon codicon-check"></span>Apply</button><button class="danger" data-reject="' + escapeHtml(action.id) + '"><span class="codicon codicon-close"></span>Reject</button></div>' : '';
        return '<div class="item"><div class="row split"><span class="item-title">' + escapeHtml(action.title) + '</span><span class="badge">' + escapeHtml(action.status) + '</span></div><div class="meta">' + escapeHtml(action.kind) + ' · ' + escapeHtml(action.sourceAgentName || 'agent') + '</div><div class="message">' + escapeHtml(detail || '') + '</div>' + (action.result ? '<div class="meta">' + escapeHtml(action.result) + '</div>' : '') + buttons + '</div>';
      }).join('');
      list.querySelectorAll('[data-apply]').forEach(button => button.addEventListener('click', () => vscode.postMessage({ type: 'applyAction', actionId: button.dataset.apply })));
      list.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => vscode.postMessage({ type: 'rejectAction', actionId: button.dataset.reject })));
    }

    function renderHistory() {
      const list = $('historyList');
      if (!state.runHistory.length) { list.innerHTML = '<div class="empty">No completed runs yet.</div>'; return; }
      list.innerHTML = state.runHistory.map(run => '<div class="item"><div class="row split"><span class="item-title">' + escapeHtml(run.userText) + '</span><span class="badge">' + escapeHtml(run.status) + '</span></div><div class="meta">' + new Date(run.startedAt).toLocaleString() + ' · ' + run.updates.length + ' updates</div></div>').join('');
    }

    function renderAttachments() {
      const tray = $('attachmentTray');
      tray.hidden = state.attachments.length === 0;
      tray.innerHTML = state.attachments.map(attachment =>
        '<span class="attachment-chip" title="' + escapeHtml(attachment.path) + '">' +
          '<span class="codicon codicon-file"></span>' +
          '<span class="attachment-name">' + escapeHtml(attachment.name) + '</span>' +
          '<span class="meta">' + escapeHtml(formatBytes(attachment.size)) + '</span>' +
          '<button class="attachment-remove" data-remove-attachment="' + escapeHtml(attachment.id) + '" title="Remove attachment" aria-label="Remove attachment"><span class="codicon codicon-close"></span></button>' +
        '</span>'
      ).join('');
      tray.querySelectorAll('[data-remove-attachment]').forEach(button => {
        button.addEventListener('click', () => vscode.postMessage({ type: 'removeAttachment', attachmentId: button.dataset.removeAttachment }));
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
      $('endpointStreaming').value = String(endpoint?.streaming ?? false);
      $('endpointTestModel').value = endpoint?.testModel || '';
      $('endpointApiVersion').value = endpoint?.apiVersion || '';
      $('endpointOrganization').value = endpoint?.organization || '';
      $('endpointApiKey').value = '';
      $('endpointApiKey').type = 'password';
      $('endpointApiKey').placeholder = endpoint?.hasApiKey ? 'Saved key available' : 'Saved locally after Save or Test';
      setEndpointEyeIcon(false);
      $('endpointHeaders').value = endpoint?.defaultHeaders ? JSON.stringify(endpoint.defaultHeaders, null, 2) : '';
    }

    function toggleEndpointApiKey() {
      const input = $('endpointApiKey');
      const shouldShow = input.type === 'password';
      if (!shouldShow) {
        input.type = 'password';
        setEndpointEyeIcon(false);
        return;
      }

      input.type = 'text';
      setEndpointEyeIcon(true);
      if (!input.value && $('endpointId').value) {
        vscode.postMessage({ type: 'loadEndpointKey', endpointId: $('endpointId').value });
      }
    }

    function handleEndpointKey(message) {
      if (message.endpointId !== $('endpointId').value) return;
      if (!message.apiKey) {
        showNotice('No saved API key for this endpoint.', 'warning');
        return;
      }

      $('endpointApiKey').value = message.apiKey;
      $('endpointApiKey').type = 'text';
      setEndpointEyeIcon(true);
    }

    function setEndpointEyeIcon(visible) {
      $('toggleEndpointApiKey').innerHTML = visible
        ? '<span class="codicon codicon-eye-closed"></span>'
        : '<span class="codicon codicon-eye"></span>';
      $('toggleEndpointApiKey').title = visible ? 'Hide API key' : 'Show saved API key';
      $('toggleEndpointApiKey').setAttribute('aria-label', visible ? 'Hide API key' : 'Show saved API key');
    }

    function runTask() {
      const text = $('taskInput').value.trim();
      if ((!text && state.attachments.length === 0) || state.running) return;
      state.running = true;
      state.streamNode = null;
      setRunButtonLoading(true);
      $('cancelRun').disabled = false;
      $('transcript').innerHTML = '';
      appendMessage('User', text || 'Attached files');
      $('taskInput').value = '';
      vscode.postMessage({ type: 'runTask', text });
    }

    function appendRunUpdate(update) {
      if (update.kind === 'token') {
        appendToken(update.message);
        return;
      }
      state.streamNode = null;
      if (update.kind === 'status') appendMessage('Status', update.message);
      else if (update.kind === 'plan') appendMessage('Plan', update.message);
      else if (update.kind === 'tool-result') appendMessage('Tool', update.message);
      else if (update.kind === 'action-proposal') appendMessage('Action', update.message);
      else if (update.kind === 'agent-result') appendMessage(update.result?.agentName || 'Agent', update.message);
      else if (update.kind === 'final') { appendMessage('Manager', update.message, 'final'); finishRun(); }
      else if (update.kind === 'cancelled') { appendMessage('Cancelled', update.message, 'error'); finishRun(); }
      else if (update.kind === 'error') { appendMessage('Error', update.message, 'error'); finishRun(); }
    }

    function appendToken(token) {
      if (!state.streamNode) state.streamNode = appendMessage('Streaming', '', 'final');
      state.streamNode.querySelector('.message-body').textContent += token;
      state.streamNode.scrollIntoView({ block: 'end' });
    }

    function finishRun() {
      state.running = false;
      setRunButtonLoading(false);
      $('cancelRun').disabled = true;
    }

    function setRunButtonLoading(loading) {
      const button = $('runTask');
      button.disabled = loading;
      button.title = loading ? 'Running' : 'Run task';
      button.setAttribute('aria-label', loading ? 'Running' : 'Run task');
      button.innerHTML = loading
        ? '<span class="codicon codicon-loading codicon-modifier-spin"></span>'
        : '<span class="codicon codicon-send"></span>';
    }

    function appendMessage(label, body, extraClass) {
      const node = document.createElement('div');
      node.className = 'message ' + (extraClass || '');
      node.innerHTML = '<div class="message-label">' + escapeHtml(label) + '</div><span class="message-body">' + escapeHtml(body) + '</span>';
      $('transcript').appendChild(node);
      node.scrollIntoView({ block: 'end' });
      return node;
    }

    function showNotice(message, level) {
      const notice = $('notice');
      notice.textContent = message;
      notice.className = 'notice show ' + (level || 'info');
      clearTimeout(showNotice.timer);
      showNotice.timer = setTimeout(() => { notice.className = 'notice'; }, 3200);
    }

    function createId(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }
    function formatBytes(value) {
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
      return (value / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
