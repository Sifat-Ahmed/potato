const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { extractPendingActions, extractToolCalls } = require('../out/actionParser');
const { createEffectiveAgentConfig, createResponsesRequestBody, resolveEndpointUrl } = require('../out/llmClient');
const { parseJsonObject } = require('../out/utils');
const { renderWebviewHtml } = require('../out/webviewHtml');

const agent = {
  id: 'agent_1',
  name: 'Coding Agent',
  role: 'coding',
  systemPrompt: '',
  enabled: true,
  createdAt: 0,
  updatedAt: 0
};

test('parseJsonObject reads fenced JSON', () => {
  const parsed = parseJsonObject('```json\n{"ok":true}\n```');
  assert.equal(parsed.ok, true);
});

test('extractToolCalls returns supported tool calls only', () => {
  const calls = extractToolCalls(JSON.stringify({
    toolCalls: [
      { name: 'read_file', arguments: { path: 'src/types.ts' } },
      { name: 'write_file', arguments: { path: 'src/example.ts', content: 'export {};' } },
      { name: 'unknown', arguments: {} }
    ]
  }));

  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'read_file');
  assert.equal(calls[1].name, 'write_file');
});

test('extractPendingActions creates approval actions', () => {
  const actions = extractPendingActions(JSON.stringify({
    fileEdits: [{ path: 'src/example.ts', content: 'export {};', description: 'Add example' }],
    fileDeletes: [{ path: 'src/old.ts', description: 'Remove old file' }],
    terminalCommands: [{ command: 'npm test', description: 'Run tests' }]
  }), agent);

  assert.equal(actions.length, 3);
  assert.equal(actions[0].kind, 'file-edit');
  assert.equal(actions[0].status, 'pending');
  assert.equal(actions[1].kind, 'file-delete');
  assert.equal(actions[2].kind, 'terminal-command');
});

test('resolveEndpointUrl builds OpenAI-compatible APIM chat routes', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'APIM',
    baseUrl: 'https://apim.example.com/gaim99-prod/openai',
    apiKind: 'chat-completions',
    authMode: 'api-key',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.2');

  assert.equal(url, 'https://apim.example.com/gaim99-prod/openai/chat/completions');
});

test('resolveEndpointUrl adds Azure API version to compatible chat routes', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'APIM',
    baseUrl: 'https://apim.example.com/gaim99-prod/openai',
    apiKind: 'chat-completions',
    authMode: 'api-key',
    apiVersion: '2024-10-21',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.2');

  assert.equal(url, 'https://apim.example.com/gaim99-prod/openai/chat/completions?api-version=2024-10-21');
});

test('resolveEndpointUrl builds Azure Responses preview routes', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'APIM Responses',
    baseUrl: 'https://apim.example.com/gaim99-prod/openai/',
    apiKind: 'responses',
    authMode: 'api-key',
    apiVersion: '2025-04-01-preview',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.1-codex');

  assert.equal(url, 'https://apim.example.com/gaim99-prod/openai/responses?api-version=2025-04-01-preview');
});

test('resolveEndpointUrl builds Azure Responses v1 routes', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'Azure Responses v1',
    baseUrl: 'https://aoai.example.com/openai/v1/',
    apiKind: 'responses',
    authMode: 'api-key',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.1-codex');

  assert.equal(url, 'https://aoai.example.com/openai/v1/responses');
});

test('createResponsesRequestBody maps Codex reasoning config', () => {
  const body = createResponsesRequestBody({
    agent: {
      ...agent,
      model: 'gpt-5.1-codex',
      reasoningEffort: 'medium',
      systemPrompt: 'You are concise.',
      temperature: 0.2
    },
    input: 'hello'
  });

  assert.deepEqual(body, {
    model: 'gpt-5.1-codex',
    input: 'hello',
    instructions: 'You are concise.',
    reasoning: { effort: 'medium' }
  });
});

test('createEffectiveAgentConfig prefers endpoint model settings', () => {
  const effective = createEffectiveAgentConfig({
    id: 'endpoint_1',
    name: 'Endpoint',
    baseUrl: 'https://apim.example.com/openai',
    model: 'gpt-5.1-codex',
    apiKind: 'responses',
    authMode: 'api-key',
    reasoningEffort: 'medium',
    createdAt: 0,
    updatedAt: 0
  }, {
    ...agent,
    model: 'old-agent-model',
    reasoningEffort: 'low',
    temperature: 0.2
  });

  assert.equal(effective.model, 'gpt-5.1-codex');
  assert.equal(effective.reasoningEffort, 'medium');
  assert.equal(effective.temperature, 0.2);
});

test('resolveEndpointUrl supports explicit deployment path overrides', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'APIM',
    baseUrl: 'https://apim.example.com/gaim99-prod/openai',
    apiKind: 'chat-completions',
    apiPath: '/deployments/gpt-5.2/chat/completions',
    authMode: 'api-key',
    apiVersion: '2024-10-21',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.2');

  assert.equal(url, 'https://apim.example.com/gaim99-prod/openai/deployments/gpt-5.2/chat/completions?api-version=2024-10-21');
});

test('resolveEndpointUrl supports explicit deployment completions overrides', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'APIM',
    baseUrl: 'https://apim.example.com/gaim99-prod/openai',
    apiKind: 'completions',
    apiPath: '/deployments/gpt-5.2/completions',
    authMode: 'api-key',
    apiVersion: '2024-10-21',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.2');

  assert.equal(url, 'https://apim.example.com/gaim99-prod/openai/deployments/gpt-5.2/completions?api-version=2024-10-21');
});

test('resolveEndpointUrl leaves complete request URLs intact', () => {
  const url = resolveEndpointUrl({
    id: 'endpoint_1',
    name: 'APIM',
    baseUrl: 'https://apim.example.com/gaim99-prod/openai/deployments/gpt-5.2/chat/completions',
    apiKind: 'chat-completions',
    authMode: 'api-key',
    createdAt: 0,
    updatedAt: 0
  }, 'gpt-5.2');

  assert.equal(url, 'https://apim.example.com/gaim99-prod/openai/deployments/gpt-5.2/chat/completions');
});

test('rendered webview keeps startup script compatible with VS Code webviews', () => {
  const html = renderWebviewHtml('codicons.css', 'fallback.js', 'nonce', 'vscode-resource:');
  const fallbackScript = fs.readFileSync(path.join(__dirname, '..', 'media', 'webviewFallback.js'), 'utf8');

  assert.equal(/\?\.|\?\?|catch\s*\{/.test(html), false);
  assert.equal(/=>|\bconst\b|\blet\b|\?\.|\?\?/.test(fallbackScript), false);
  assert.match(html, /src="fallback\.js"/);
  assert.match(html, /initializeWebview\(\);/);
  assert.match(html, /type: 'webviewError'/);
  assert.match(html, /Thinking\.\.\./);
});

test('rendered webview includes required interactive controls', () => {
  const html = renderWebviewHtml('codicons.css', 'fallback.js', 'nonce', 'vscode-resource:');
  const requiredIds = [
    'historyButton',
    'menuButton',
    'settingsMenu',
    'taskInput',
    'runTask',
    'attachFiles',
    'newConversation',
    'newAgent',
    'newEndpoint',
    'agentForm',
    'endpointForm',
    'testEndpoint',
    'toggleEndpointApiKey'
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});
