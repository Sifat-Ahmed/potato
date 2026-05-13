import * as vscode from 'vscode';
import { ConversationMessage, ConversationRecord, ConversationSummary } from './types';
import { createId } from './utils';

const DATABASE_FILE = 'conversation-db.v1.json';
const MAX_CONVERSATIONS = 80;
const MAX_MESSAGES_PER_CONVERSATION = 240;
const MAX_CONTEXT_MESSAGES = 16;

interface ConversationDatabaseState {
  schemaVersion: 1;
  activeConversationId?: string;
  conversations: ConversationRecord[];
}

export interface ConversationPublicState {
  conversations: ConversationSummary[];
  activeConversation?: ConversationRecord;
}

export class ConversationDatabase {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getPublicState(): Promise<ConversationPublicState> {
    const state = await this.readState();
    const activeConversation = state.conversations.find(conversation => conversation.id === state.activeConversationId);

    return {
      conversations: state.conversations.map(conversation => ({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length
      })),
      activeConversation
    };
  }

  async getOrCreateActiveConversation(titleSeed?: string): Promise<ConversationRecord> {
    const state = await this.readState();
    const active = state.conversations.find(conversation => conversation.id === state.activeConversationId);
    if (active) {
      return active;
    }

    return this.createConversation(titleSeed || 'New conversation');
  }

  async createConversation(titleSeed?: string): Promise<ConversationRecord> {
    const state = await this.readState();
    const now = Date.now();
    const conversation: ConversationRecord = {
      id: createId('conversation'),
      title: summarizeTitle(titleSeed || 'New conversation'),
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    await this.writeState({
      ...state,
      activeConversationId: conversation.id,
      conversations: [conversation, ...state.conversations].slice(0, MAX_CONVERSATIONS)
    });

    return conversation;
  }

  async openConversation(conversationId: string): Promise<void> {
    const state = await this.readState();
    if (!state.conversations.some(conversation => conversation.id === conversationId)) {
      throw new Error('Conversation not found.');
    }

    await this.writeState({ ...state, activeConversationId: conversationId });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const state = await this.readState();
    const conversations = state.conversations.filter(conversation => conversation.id !== conversationId);
    await this.writeState({
      ...state,
      activeConversationId: state.activeConversationId === conversationId ? conversations[0]?.id : state.activeConversationId,
      conversations
    });
  }

  async appendMessage(
    conversationId: string,
    message: Omit<ConversationMessage, 'id' | 'createdAt'>
  ): Promise<ConversationMessage> {
    const state = await this.readState();
    const now = Date.now();
    const nextMessage: ConversationMessage = {
      ...message,
      id: createId('message'),
      createdAt: now
    };

    const conversations = state.conversations.map(conversation => {
      if (conversation.id !== conversationId) {
        return conversation;
      }

      return {
        ...conversation,
        title: conversation.messages.length === 0 && message.role === 'user'
          ? summarizeTitle(message.content)
          : conversation.title,
        updatedAt: now,
        messages: [...conversation.messages, nextMessage].slice(-MAX_MESSAGES_PER_CONVERSATION)
      };
    });

    await this.writeState({
      ...state,
      activeConversationId: conversationId,
      conversations: conversations.sort((left, right) => right.updatedAt - left.updatedAt)
    });

    return nextMessage;
  }

  async buildContext(conversationId: string): Promise<string> {
    const state = await this.readState();
    const conversation = state.conversations.find(item => item.id === conversationId);
    const messages = conversation?.messages.slice(-MAX_CONTEXT_MESSAGES) ?? [];
    if (messages.length === 0) {
      return 'Conversation history: none.';
    }

    return [
      'Conversation history:',
      ...messages.map(message => `${message.role.toUpperCase()}: ${message.content}`)
    ].join('\n\n');
  }

  private async readState(): Promise<ConversationDatabaseState> {
    const uri = this.databaseUri();
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as Partial<ConversationDatabaseState>;
      const normalized = normalizeConversationState(parsed);
      if (normalized.changed) {
        await this.writeState(normalized.state);
      }
      return normalized.state;
    } catch {
      return { schemaVersion: 1, conversations: [] };
    }
  }

  private async writeState(state: ConversationDatabaseState): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await vscode.workspace.fs.writeFile(
      this.databaseUri(),
      Buffer.from(JSON.stringify(state, null, 2), 'utf8')
    );
  }

  private databaseUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, DATABASE_FILE);
  }
}

function summarizeTitle(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) {
    return 'New conversation';
  }

  return compact.length > 72 ? `${compact.slice(0, 69)}...` : compact;
}

function normalizeConversationState(parsed: Partial<ConversationDatabaseState>): { state: ConversationDatabaseState; changed: boolean } {
  let changed = false;
  const conversations = (Array.isArray(parsed.conversations) ? parsed.conversations : [])
    .map((conversation, index) => normalizeConversation(conversation, index))
    .filter((conversation): conversation is ConversationRecord => Boolean(conversation))
    .slice(0, MAX_CONVERSATIONS);

  if (conversations.length !== (parsed.conversations?.length ?? 0)) {
    changed = true;
  }

  const activeConversationId = typeof parsed.activeConversationId === 'string'
    && conversations.some(conversation => conversation.id === parsed.activeConversationId)
    ? parsed.activeConversationId
    : conversations[0]?.id;

  if (activeConversationId !== parsed.activeConversationId) {
    changed = true;
  }

  return {
    changed,
    state: {
      schemaVersion: 1,
      activeConversationId,
      conversations
    }
  };
}

function normalizeConversation(value: unknown, index: number): ConversationRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const now = Date.now();
  const messages = (Array.isArray(value.messages) ? value.messages : [])
    .map((message, messageIndex) => normalizeMessage(message, messageIndex))
    .filter((message): message is ConversationMessage => Boolean(message))
    .slice(-MAX_MESSAGES_PER_CONVERSATION);

  return {
    id: stringValue(value.id) || createId(`conversation_${index}`),
    title: stringValue(value.title) || summarizeTitle(messages[0]?.content || 'New conversation'),
    createdAt: numberValue(value.createdAt) ?? now,
    updatedAt: numberValue(value.updatedAt) ?? now,
    messages
  };
}

function normalizeMessage(value: unknown, index: number): ConversationMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const role = value.role === 'user' || value.role === 'assistant' || value.role === 'system' || value.role === 'tool'
    ? value.role
    : 'system';
  return {
    id: stringValue(value.id) || createId(`message_${index}`),
    role,
    content: stringValue(value.content) || '',
    createdAt: numberValue(value.createdAt) ?? Date.now(),
    runId: stringValue(value.runId),
    updateKind: typeof value.updateKind === 'string' ? value.updateKind as ConversationMessage['updateKind'] : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
