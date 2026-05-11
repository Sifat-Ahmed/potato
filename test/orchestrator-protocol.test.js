const assert = require('node:assert/strict');
const test = require('node:test');

const { extractPendingActions, extractToolCalls } = require('../out/actionParser');
const { resolveEndpointUrl } = require('../out/llmClient');
const { parseJsonObject } = require('../out/utils');

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
