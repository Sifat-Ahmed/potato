(function () {
  var fallbackDelayMs = 5000;

  function byId(id) {
    return document.getElementById(id);
  }

  function getVsCode() {
    if (window.__potatoVsCode) {
      return window.__potatoVsCode;
    }
    try {
      window.__potatoVsCode = acquireVsCodeApi();
      return window.__potatoVsCode;
    } catch (error) {
      return {
        postMessage: function () {}
      };
    }
  }

  function post(message) {
    try {
      getVsCode().postMessage(message);
    } catch (error) {}
  }

  function showNotice(message, level) {
    var notice = byId('notice');
    if (!notice) {
      return;
    }
    notice.textContent = message;
    notice.className = 'notice show ' + (level || 'info');
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function addEvent(id, eventName, handler) {
    var node = byId(id);
    if (node) {
      node.addEventListener(eventName, handler);
    }
  }

  function setActive(node, active) {
    if (!node) {
      return;
    }
    if (node.classList) {
      node.classList.toggle('active', active);
      return;
    }
    if (active && node.className.indexOf('active') === -1) {
      node.className += ' active';
    }
    if (!active) {
      node.className = node.className.replace(/\s?active/g, '');
    }
  }

  function closest(node, selector) {
    while (node && node.nodeType === 1) {
      if (node.matches && node.matches(selector)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function findById(items, id) {
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (items[index].id === id) {
        return items[index];
      }
    }
    return undefined;
  }

  function createId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function activateFallback() {
    if (window.__potatoMainReady || window.__potatoFallbackReady) {
      return;
    }
    window.__potatoFallbackReady = true;

    var state = {
      endpoints: [],
      agents: [],
      pendingActions: [],
      runHistory: [],
      conversations: [],
      activeConversation: undefined,
      attachments: [],
      running: false,
      streamNode: null,
      thinkingNode: null
    };

    function setTab(tab) {
      var buttons = document.querySelectorAll('[data-tab]');
      var sections = document.querySelectorAll('.section');
      var index;
      for (index = 0; index < buttons.length; index += 1) {
        setActive(buttons[index], buttons[index].getAttribute('data-tab') === tab);
      }
      for (index = 0; index < sections.length; index += 1) {
        setActive(sections[index], sections[index].id === tab);
      }
      setActive(byId('historyButton'), tab === 'history');
      setActive(byId('menuButton'), tab === 'agents' || tab === 'endpoints' || tab === 'actions');
    }

    function closeMenu() {
      var menu = byId('settingsMenu');
      var button = byId('menuButton');
      if (menu) {
        menu.hidden = true;
      }
      if (button) {
        button.setAttribute('aria-expanded', 'false');
      }
    }

    function toggleMenu() {
      var menu = byId('settingsMenu');
      var button = byId('menuButton');
      var open;
      if (!menu) {
        return;
      }
      open = menu.hidden;
      menu.hidden = !open;
      if (button) {
        button.setAttribute('aria-expanded', String(open));
      }
    }

    function pendingCount() {
      var count = 0;
      var index;
      for (index = 0; index < state.pendingActions.length; index += 1) {
        if (state.pendingActions[index].status === 'pending') {
          count += 1;
        }
      }
      return count;
    }

    function renderAll() {
      var summary = byId('summary');
      var actionCount = byId('actionCount');
      if (summary) {
        summary.textContent = state.endpoints.length + ' endpoint' + (state.endpoints.length === 1 ? '' : 's') + ', ' + state.agents.length + ' agent' + (state.agents.length === 1 ? '' : 's') + ', ' + state.conversations.length + ' chat' + (state.conversations.length === 1 ? '' : 's') + ', ' + pendingCount() + ' pending';
      }
      if (actionCount) {
        actionCount.textContent = String(pendingCount());
      }
      renderEndpointOptions();
      renderAgents();
      renderEndpoints();
      renderActions();
      renderConversations();
      renderHistory();
      renderAttachments();
      if (!state.running) {
        renderConversation();
      }
      if (byId('agentId') && !byId('agentId').value && state.agents[0]) {
        editAgent(state.agents[0]);
      }
      if (byId('endpointId') && !byId('endpointId').value && state.endpoints[0]) {
        editEndpoint(state.endpoints[0]);
      }
    }

    function renderEndpointOptions() {
      var select = byId('agentEndpoint');
      var selected;
      var html = '<option value="">No endpoint</option>';
      var index;
      var endpoint;
      if (!select) {
        return;
      }
      selected = select.value;
      for (index = 0; index < state.endpoints.length; index += 1) {
        endpoint = state.endpoints[index];
        html += '<option value="' + escapeHtml(endpoint.id) + '">' + escapeHtml(endpoint.name + (endpoint.model ? ' · ' + endpoint.model : '')) + '</option>';
      }
      select.innerHTML = html;
      select.value = selected;
    }

    function renderAgents() {
      var list = byId('agentList');
      var html = '';
      var index;
      var agent;
      var endpoint;
      if (!list) {
        return;
      }
      if (!state.agents.length) {
        list.innerHTML = '<div class="empty">No agents yet.</div>';
        return;
      }
      for (index = 0; index < state.agents.length; index += 1) {
        agent = state.agents[index];
        endpoint = findById(state.endpoints, agent.endpointId);
        html += '<button class="item" data-agent-id="' + escapeHtml(agent.id) + '"><div class="row split"><span class="item-title">' + escapeHtml(agent.name) + '</span><span class="badge">' + escapeHtml(agent.role) + '</span></div><div class="meta">' + escapeHtml(endpoint ? endpoint.name + (endpoint.model ? ' · ' + endpoint.model : '') : 'No endpoint') + '</div></button>';
      }
      list.innerHTML = html;
      bindListButtons(list, '[data-agent-id]', function (button) {
        editAgent(findById(state.agents, button.getAttribute('data-agent-id')));
      });
    }

    function renderEndpoints() {
      var list = byId('endpointList');
      var html = '';
      var index;
      var endpoint;
      if (!list) {
        return;
      }
      if (!state.endpoints.length) {
        list.innerHTML = '<div class="empty">No endpoints yet.</div>';
        return;
      }
      for (index = 0; index < state.endpoints.length; index += 1) {
        endpoint = state.endpoints[index];
        html += '<button class="item" data-endpoint-id="' + escapeHtml(endpoint.id) + '"><div class="row split"><span class="item-title">' + escapeHtml(endpoint.name) + '</span><span class="badge">' + escapeHtml(endpoint.apiKind) + '</span></div><div class="meta">' + escapeHtml(endpoint.model || 'No model') + '</div><div class="meta">' + escapeHtml(endpoint.baseUrl) + '</div><div class="meta">' + escapeHtml(endpoint.authMode) + ' · ' + (endpoint.streaming ? 'streaming' : 'no streaming') + ' · ' + (endpoint.hasApiKey ? 'key stored' : 'no key') + '</div></button>';
      }
      list.innerHTML = html;
      bindListButtons(list, '[data-endpoint-id]', function (button) {
        editEndpoint(findById(state.endpoints, button.getAttribute('data-endpoint-id')));
      });
    }

    function renderActions() {
      var list = byId('actionList');
      var html = '';
      var index;
      var action;
      var detail;
      var buttons;
      if (!list) {
        return;
      }
      if (!state.pendingActions.length) {
        list.innerHTML = '<div class="empty">No proposed actions yet.</div>';
        return;
      }
      for (index = 0; index < state.pendingActions.length; index += 1) {
        action = state.pendingActions[index];
        detail = action.kind === 'file-edit'
          ? action.fileEdit && action.fileEdit.path
          : action.kind === 'file-delete'
            ? action.fileDelete && action.fileDelete.path
            : action.terminalCommand && action.terminalCommand.command;
        buttons = action.status === 'pending' ? '<div class="row"><button class="primary" data-apply="' + escapeHtml(action.id) + '"><span class="codicon codicon-check"></span>Apply</button><button class="danger" data-reject="' + escapeHtml(action.id) + '"><span class="codicon codicon-close"></span>Reject</button></div>' : '';
        html += '<div class="item"><div class="row split"><span class="item-title">' + escapeHtml(action.title) + '</span><span class="badge">' + escapeHtml(action.status) + '</span></div><div class="meta">' + escapeHtml(action.kind) + ' · ' + escapeHtml(action.sourceAgentName || 'agent') + '</div><div class="message">' + escapeHtml(detail || '') + '</div>' + (action.result ? '<div class="meta">' + escapeHtml(action.result) + '</div>' : '') + buttons + '</div>';
      }
      list.innerHTML = html;
      bindListButtons(list, '[data-apply]', function (button) {
        post({ type: 'applyAction', actionId: button.getAttribute('data-apply') });
      });
      bindListButtons(list, '[data-reject]', function (button) {
        post({ type: 'rejectAction', actionId: button.getAttribute('data-reject') });
      });
    }

    function renderConversations() {
      var list = byId('conversationList');
      var html = '';
      var index;
      var conversation;
      var activeId = state.activeConversation && state.activeConversation.id;
      if (!list) {
        return;
      }
      if (!state.conversations.length) {
        list.innerHTML = '<div class="empty">No conversations yet.</div>';
        return;
      }
      for (index = 0; index < state.conversations.length; index += 1) {
        conversation = state.conversations[index];
        html += '<div class="item ' + (activeId === conversation.id ? 'active' : '') + '"><button class="conversation-open" data-conversation-id="' + escapeHtml(conversation.id) + '"><div class="row split"><span class="item-title">' + escapeHtml(conversation.title) + '</span><span class="badge">' + escapeHtml(String(conversation.messageCount)) + '</span></div><div class="meta">' + new Date(conversation.updatedAt).toLocaleString() + '</div></button><div class="row"><button class="danger" data-delete-conversation="' + escapeHtml(conversation.id) + '"><span class="codicon codicon-trash"></span>Delete</button></div></div>';
      }
      list.innerHTML = html;
      bindListButtons(list, '[data-conversation-id]', function (button) {
        post({ type: 'openConversation', conversationId: button.getAttribute('data-conversation-id') });
        setTab('chat');
      });
      bindListButtons(list, '[data-delete-conversation]', function (button) {
        post({ type: 'deleteConversation', conversationId: button.getAttribute('data-delete-conversation') });
      });
    }

    function renderHistory() {
      var list = byId('historyList');
      var html = '';
      var index;
      var run;
      if (!list) {
        return;
      }
      if (!state.runHistory.length) {
        list.innerHTML = '<div class="empty">No completed runs yet.</div>';
        return;
      }
      for (index = 0; index < state.runHistory.length; index += 1) {
        run = state.runHistory[index];
        html += '<div class="item"><div class="row split"><span class="item-title">' + escapeHtml(run.userText) + '</span><span class="badge">' + escapeHtml(run.status) + '</span></div><div class="meta">' + new Date(run.startedAt).toLocaleString() + ' · ' + run.updates.length + ' updates</div></div>';
      }
      list.innerHTML = html;
    }

    function renderConversation() {
      var transcript = byId('transcript');
      var messages = state.activeConversation && state.activeConversation.messages || [];
      var index;
      var message;
      if (!transcript) {
        return;
      }
      transcript.innerHTML = '';
      if (!messages.length) {
        transcript.innerHTML = '<div class="empty">Configure an endpoint, assign it to the manager, then run a task.</div>';
        return;
      }
      for (index = 0; index < messages.length; index += 1) {
        message = messages[index];
        appendMessage(labelForMessage(message), message.content, classForMessage(message));
      }
    }

    function renderAttachments() {
      var tray = byId('attachmentTray');
      var html = '';
      var index;
      var attachment;
      if (!tray) {
        return;
      }
      tray.hidden = state.attachments.length === 0;
      for (index = 0; index < state.attachments.length; index += 1) {
        attachment = state.attachments[index];
        html += '<span class="attachment-chip" title="' + escapeHtml(attachment.path) + '"><span class="codicon codicon-file"></span><span class="attachment-name">' + escapeHtml(attachment.name) + '</span><span class="meta">' + escapeHtml(formatBytes(attachment.size)) + '</span><button class="attachment-remove" data-remove-attachment="' + escapeHtml(attachment.id) + '" title="Remove attachment" aria-label="Remove attachment"><span class="codicon codicon-close"></span></button></span>';
      }
      tray.innerHTML = html;
      bindListButtons(tray, '[data-remove-attachment]', function (button) {
        post({ type: 'removeAttachment', attachmentId: button.getAttribute('data-remove-attachment') });
      });
    }

    function bindListButtons(root, selector, handler) {
      var buttons = root.querySelectorAll(selector);
      var index;
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].addEventListener('click', function (event) {
          event.stopPropagation();
          handler(this);
        });
      }
    }

    function editAgent(agent) {
      setValue('agentId', agent && agent.id || '');
      setValue('agentName', agent && agent.name || '');
      setValue('agentRole', agent && agent.role || 'custom');
      setValue('agentEnabled', String(agent && agent.enabled !== undefined ? agent.enabled : true));
      setValue('agentEndpoint', agent && agent.endpointId || '');
      setValue('agentPrompt', agent && agent.systemPrompt || '');
    }

    function editEndpoint(endpoint) {
      var keyInput = byId('endpointApiKey');
      setValue('endpointId', endpoint && endpoint.id || '');
      setValue('endpointName', endpoint && endpoint.name || '');
      setValue('endpointModel', endpoint && (endpoint.model || endpoint.testModel) || '');
      setValue('endpointBaseUrl', endpoint && endpoint.baseUrl || '');
      setValue('endpointPath', endpoint && endpoint.apiPath || '');
      setValue('endpointKind', endpoint && endpoint.apiKind || 'chat-completions');
      setValue('endpointAuth', endpoint && endpoint.authMode || 'bearer');
      setValue('endpointStreaming', String(endpoint && endpoint.streaming !== undefined ? endpoint.streaming : false));
      setValue('endpointReasoningEffort', endpoint && endpoint.reasoningEffort || '');
      setValue('endpointTemperature', endpoint && endpoint.temperature !== undefined ? endpoint.temperature : '');
      setValue('endpointApiVersion', endpoint && endpoint.apiVersion || '');
      setValue('endpointOrganization', endpoint && endpoint.organization || '');
      setValue('endpointHeaders', endpoint && endpoint.defaultHeaders ? JSON.stringify(endpoint.defaultHeaders, null, 2) : '');
      if (keyInput) {
        keyInput.value = '';
        keyInput.type = 'password';
        keyInput.placeholder = endpoint && endpoint.hasApiKey ? 'Saved key available' : 'Saved locally after Save or Test';
      }
      setEndpointEyeIcon(false);
      clearEndpointTestResult();
    }

    function setValue(id, value) {
      var node = byId(id);
      if (node) {
        node.value = value;
      }
    }

    function readEndpointForm() {
      var form = byId('endpointForm');
      var headersText;
      var defaultHeaders;
      if (form && form.reportValidity && !form.reportValidity()) {
        return undefined;
      }
      headersText = valueOf('endpointHeaders').trim();
      if (headersText) {
        try {
          defaultHeaders = JSON.parse(headersText);
        } catch (error) {
          showNotice('Default headers must be valid JSON.', 'error');
          return undefined;
        }
      }
      return {
        endpoint: {
          id: valueOf('endpointId') || createId('endpoint'),
          name: valueOf('endpointName').trim(),
          baseUrl: valueOf('endpointBaseUrl').trim(),
          model: valueOf('endpointModel').trim(),
          apiKind: valueOf('endpointKind'),
          apiPath: valueOf('endpointPath').trim() || undefined,
          authMode: valueOf('endpointAuth'),
          streaming: valueOf('endpointStreaming') === 'true',
          reasoningEffort: valueOf('endpointReasoningEffort') || undefined,
          temperature: valueOf('endpointTemperature') === '' ? undefined : Number(valueOf('endpointTemperature')),
          apiVersion: valueOf('endpointApiVersion').trim() || undefined,
          organization: valueOf('endpointOrganization').trim() || undefined,
          defaultHeaders: defaultHeaders
        },
        apiKey: valueOf('endpointApiKey')
      };
    }

    function valueOf(id) {
      var node = byId(id);
      return node ? node.value : '';
    }

    function toggleEndpointApiKey() {
      var input = byId('endpointApiKey');
      var endpointId = valueOf('endpointId');
      if (!input) {
        return;
      }
      if (input.type === 'text') {
        input.type = 'password';
        setEndpointEyeIcon(false);
        return;
      }
      input.type = 'text';
      setEndpointEyeIcon(true);
      if (!input.value && endpointId) {
        post({ type: 'loadEndpointKey', endpointId: endpointId });
      }
    }

    function setEndpointEyeIcon(visible) {
      var button = byId('toggleEndpointApiKey');
      if (!button) {
        return;
      }
      button.innerHTML = visible
        ? '<span class="codicon codicon-eye-closed"></span>'
        : '<span class="codicon codicon-eye"></span>';
      button.title = visible ? 'Hide API key' : 'Show saved API key';
      button.setAttribute('aria-label', visible ? 'Hide API key' : 'Show saved API key');
    }

    function clearEndpointTestResult() {
      var node = byId('endpointTestResult');
      if (node) {
        node.className = 'test-result';
        node.textContent = '';
      }
      setEndpointTestLoading(false);
    }

    function handleEndpointTestResult(message) {
      var node = byId('endpointTestResult');
      if (message.endpointId !== valueOf('endpointId') || !node) {
        return;
      }
      node.className = 'test-result show ' + (message.status === 'ok' ? 'ok' : message.status === 'error' ? 'error' : '');
      node.textContent = (message.status === 'running' ? 'Testing endpoint...' : message.message) + (message.url ? '\nURL: ' + message.url : '');
      setEndpointTestLoading(message.status === 'running');
    }

    function setEndpointTestLoading(loading) {
      var button = byId('testEndpoint');
      if (!button) {
        return;
      }
      button.disabled = loading;
      button.innerHTML = loading
        ? '<span class="codicon codicon-loading codicon-modifier-spin"></span>Testing'
        : '<span class="codicon codicon-beaker"></span>Test';
    }

    function runTask() {
      var input = byId('taskInput');
      var text = input ? input.value.trim() : '';
      if ((!text && state.attachments.length === 0) || state.running) {
        return;
      }
      state.running = true;
      state.streamNode = null;
      state.thinkingNode = null;
      setRunButtonLoading(true);
      if (byId('cancelRun')) {
        byId('cancelRun').disabled = false;
      }
      appendMessage('User', text || 'Attached files');
      state.thinkingNode = appendMessage('Potato', 'Thinking...', 'thinking');
      if (input) {
        input.value = '';
      }
      post({ type: 'runTask', text: text });
    }

    function appendRunUpdate(update) {
      if (update.kind === 'token') {
        appendToken(update.message);
        return;
      }
      state.streamNode = null;
      if (update.kind === 'status' || update.kind === 'plan' || update.kind === 'tool-result' || update.kind === 'action-proposal' || update.kind === 'agent-result') return;
      if (update.kind === 'final') {
        removeThinking();
        if (state.streamNode) {
          state.streamNode.className = 'message final';
          state.streamNode.querySelector('.message-label').textContent = 'Manager';
          if (!state.streamNode.querySelector('.message-body').textContent.trim()) {
            state.streamNode.querySelector('.message-body').textContent = update.message;
          }
        } else {
          appendMessage('Manager', update.message, 'final');
        }
        finishRun();
      }
      else if (update.kind === 'cancelled') { removeThinking(); appendMessage('Cancelled', update.message, 'error'); finishRun(); }
      else if (update.kind === 'error') { removeThinking(); appendMessage('Error', update.message, 'error'); finishRun(); }
    }

    function appendToken(token) {
      if (!state.streamNode) {
        if (state.thinkingNode) {
          state.streamNode = state.thinkingNode;
          state.thinkingNode = null;
          state.streamNode.className = 'message final';
          state.streamNode.querySelector('.message-label').textContent = 'Manager';
          state.streamNode.querySelector('.message-body').textContent = '';
        } else {
          state.streamNode = appendMessage('Manager', '', 'final');
        }
      }
      state.streamNode.querySelector('.message-body').textContent += token;
      state.streamNode.scrollIntoView({ block: 'end' });
    }

    function finishRun() {
      state.running = false;
      state.thinkingNode = null;
      setRunButtonLoading(false);
      if (byId('cancelRun')) {
        byId('cancelRun').disabled = true;
      }
    }

    function removeThinking() {
      if (state.thinkingNode && state.thinkingNode.parentNode) {
        state.thinkingNode.parentNode.removeChild(state.thinkingNode);
      }
      state.thinkingNode = null;
    }

    function setRunButtonLoading(loading) {
      var button = byId('runTask');
      if (!button) {
        return;
      }
      button.disabled = loading;
      button.title = loading ? 'Running' : 'Run task';
      button.setAttribute('aria-label', loading ? 'Running' : 'Run task');
      button.innerHTML = loading
        ? '<span class="codicon codicon-loading codicon-modifier-spin"></span>'
        : '<span class="codicon codicon-send"></span>';
    }

    function appendMessage(label, body, extraClass) {
      var transcript = byId('transcript');
      var empties;
      var index;
      var node;
      if (!transcript) {
        return undefined;
      }
      empties = transcript.querySelectorAll('.empty');
      for (index = 0; index < empties.length; index += 1) {
        empties[index].parentNode.removeChild(empties[index]);
      }
      node = document.createElement('div');
      node.className = 'message ' + (extraClass || '');
      node.innerHTML = '<div class="message-label">' + escapeHtml(label) + '</div><span class="message-body">' + escapeHtml(body) + '</span>';
      transcript.appendChild(node);
      node.scrollIntoView({ block: 'end' });
      return node;
    }

    function labelForMessage(message) {
      if (message.role === 'user') return 'User';
      if (message.role === 'assistant') return 'Manager';
      if (message.role === 'tool') return 'Tool';
      return 'System';
    }

    function classForMessage(message) {
      if (message.role === 'assistant') return 'final';
      if (message.role === 'system') return 'error';
      return '';
    }

    function formatBytes(value) {
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
      return (value / (1024 * 1024)).toFixed(1) + ' MB';
    }

    window.addEventListener('message', function (event) {
      var message = event.data;
      if (!message) {
        return;
      }
      if (message.type === 'state') {
        state.endpoints = message.state.endpoints || [];
        state.agents = message.state.agents || [];
        state.pendingActions = message.state.pendingActions || [];
        state.runHistory = message.state.runHistory || [];
        state.conversations = message.state.conversations || [];
        state.activeConversation = message.state.activeConversation;
        renderAll();
      }
      if (message.type === 'attachments') {
        state.attachments = message.attachments || [];
        renderAttachments();
      }
      if (message.type === 'endpointKey') {
        if (message.endpointId === valueOf('endpointId') && message.apiKey) {
          setValue('endpointApiKey', message.apiKey);
          byId('endpointApiKey').type = 'text';
          setEndpointEyeIcon(true);
        }
      }
      if (message.type === 'endpointTestResult') {
        handleEndpointTestResult(message);
      }
      if (message.type === 'runUpdate') {
        appendRunUpdate(message.update);
      }
      if (message.type === 'notice') {
        showNotice(message.message, message.level);
      }
    });

    document.addEventListener('click', function (event) {
      var target = event.target;
      var tabButton = closest(target, '[data-tab]');
      var payload;
      if (tabButton) {
        setTab(tabButton.getAttribute('data-tab'));
        closeMenu();
        return;
      }
      if (closest(target, '#historyButton')) {
        setTab('history');
        closeMenu();
        return;
      }
      if (closest(target, '#menuButton')) {
        event.stopPropagation();
        toggleMenu();
        return;
      }
      if (closest(target, '#refresh')) {
        post({ type: 'ready' });
        return;
      }
      if (closest(target, '#importConfig')) {
        post({ type: 'importConfig' });
        return;
      }
      if (closest(target, '#exportConfig')) {
        post({ type: 'exportConfig' });
        return;
      }
      if (closest(target, '#newConversation')) {
        post({ type: 'newConversation' });
        setTab('chat');
        return;
      }
      if (closest(target, '#runTask')) {
        runTask();
        return;
      }
      if (closest(target, '#cancelRun')) {
        post({ type: 'cancelRun' });
        return;
      }
      if (closest(target, '#attachFiles')) {
        post({ type: 'attachFiles' });
        return;
      }
      if (closest(target, '#newAgent')) {
        editAgent();
        return;
      }
      if (closest(target, '#newEndpoint')) {
        editEndpoint();
        return;
      }
      if (closest(target, '#azurePreset')) {
        setValue('endpointKind', 'chat-completions');
        setValue('endpointAuth', 'api-key');
        setValue('endpointApiVersion', valueOf('endpointApiVersion') || '2024-10-21');
        setValue('endpointPath', '');
        return;
      }
      if (closest(target, '#azureResponsesPreset')) {
        setValue('endpointKind', 'responses');
        setValue('endpointAuth', 'api-key');
        setValue('endpointApiVersion', valueOf('endpointApiVersion') || '2025-04-01-preview');
        setValue('endpointPath', '');
        return;
      }
      if (closest(target, '#openAiPreset')) {
        setValue('endpointKind', 'chat-completions');
        setValue('endpointAuth', 'bearer');
        setValue('endpointPath', '');
        return;
      }
      if (closest(target, '#testEndpoint')) {
        payload = readEndpointForm();
        if (payload) {
          post({ type: 'saveAndTestEndpoint', endpoint: payload.endpoint, apiKey: payload.apiKey });
          setValue('endpointId', payload.endpoint.id);
        }
        return;
      }
      if (closest(target, '#toggleEndpointApiKey')) {
        toggleEndpointApiKey();
        return;
      }
      if (closest(target, '#deleteAgent')) {
        if (valueOf('agentId')) {
          post({ type: 'deleteAgent', agentId: valueOf('agentId') });
        }
        editAgent();
        return;
      }
      if (closest(target, '#deleteEndpoint')) {
        if (valueOf('endpointId')) {
          post({ type: 'deleteEndpoint', endpointId: valueOf('endpointId') });
        }
        editEndpoint();
        return;
      }
      if (!closest(target, '#settingsMenu')) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMenu();
      }
      if (event.target && event.target.id === 'taskInput' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        runTask();
      }
    });

    addEvent('agentForm', 'submit', function (event) {
      event.preventDefault();
      post({
        type: 'saveAgent',
        agent: {
          id: valueOf('agentId') || createId('agent'),
          name: valueOf('agentName').trim(),
          role: valueOf('agentRole'),
          endpointId: valueOf('agentEndpoint') || undefined,
          systemPrompt: valueOf('agentPrompt').trim(),
          enabled: valueOf('agentEnabled') === 'true'
        }
      });
    });

    addEvent('endpointForm', 'submit', function (event) {
      var payload;
      event.preventDefault();
      payload = readEndpointForm();
      if (!payload) {
        return;
      }
      post({ type: 'saveEndpoint', endpoint: payload.endpoint, apiKey: payload.apiKey });
      setValue('endpointId', payload.endpoint.id);
    });

    if (byId('summary')) {
      byId('summary').textContent = 'Fallback UI active';
    }
    appendMessage('System', 'Potato fallback UI loaded because the main webview script did not finish startup.', 'error');
    showNotice('Potato fallback UI loaded. Check the Potato output channel for the main script error.', 'warning');
    post({ type: 'webviewError', message: 'Main webview controller did not report startup completion; fallback UI attached.' });
    post({ type: 'ready' });
  }

  setTimeout(activateFallback, fallbackDelayMs);
})();
