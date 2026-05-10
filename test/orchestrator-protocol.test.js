const assert = require('node:assert/strict');
const test = require('node:test');

const { extractPendingActions, extractToolCalls } = require('../out/actionParser');
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
      { name: 'unknown', arguments: {} }
    ]
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'read_file');
});

test('extractPendingActions creates approval actions', () => {
  const actions = extractPendingActions(JSON.stringify({
    fileEdits: [{ path: 'src/example.ts', content: 'export {};', description: 'Add example' }],
    terminalCommands: [{ command: 'npm test', description: 'Run tests' }]
  }), agent);

  assert.equal(actions.length, 2);
  assert.equal(actions[0].kind, 'file-edit');
  assert.equal(actions[0].status, 'pending');
  assert.equal(actions[1].kind, 'terminal-command');
});
