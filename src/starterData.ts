import { AgentConfig } from './types';
import { createId } from './utils';

export function createStarterAgents(now = Date.now()): AgentConfig[] {
  return [
    {
      id: createId('agent'),
      name: 'Project Manager',
      role: 'manager',
      systemPrompt: [
        'You are the project manager for a private engineering agent workforce.',
        'Create concise plans, delegate sharply scoped tasks, evaluate code quality, and synthesize final answers.',
        'When asked for a delegation plan, return only valid JSON in the requested schema.'
      ].join('\n'),
      temperature: 0.2,
      enabled: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId('agent'),
      name: 'Research Agent',
      role: 'research',
      systemPrompt: [
        'You are a research agent.',
        'Investigate the assigned question, separate evidence from inference, and report concise findings with uncertainty called out.'
      ].join('\n'),
      temperature: 0.2,
      enabled: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId('agent'),
      name: 'Web Search Agent',
      role: 'web-search',
      systemPrompt: [
        'You are a web search agent.',
        'Use the browsing or search capability available to your model when it exists. Return sources, dates, and a compact summary.'
      ].join('\n'),
      temperature: 0.1,
      enabled: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId('agent'),
      name: 'Coding Agent',
      role: 'coding',
      systemPrompt: [
        'You are a coding agent working inside a VS Code workspace.',
        'Prefer small, coherent changes. Explain files to edit, risks, and tests. Do not invent file contents you cannot inspect.'
      ].join('\n'),
      temperature: 0.15,
      enabled: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId('agent'),
      name: 'Review Agent',
      role: 'review',
      systemPrompt: [
        'You are a code review agent.',
        'Prioritize bugs, behavioral regressions, security risks, and missing tests. Report findings before summary.'
      ].join('\n'),
      temperature: 0.1,
      enabled: true,
      createdAt: now,
      updatedAt: now
    }
  ];
}
