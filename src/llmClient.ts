import { AgentCallRequest, AgentCallResult, ChatMessage, EndpointConfig } from './types';
import { cleanBaseUrl } from './utils';

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    text?: string;
  }>;
}

interface ResponsesApiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export class LlmClient {
  constructor(private readonly getApiKey: (endpointId: string) => Promise<string | undefined>) {}

  async callAgent(endpoint: EndpointConfig, request: AgentCallRequest): Promise<AgentCallResult> {
    const apiKey = await this.getApiKey(endpoint.id);
    const headers = this.buildHeaders(endpoint, apiKey);
    const url = this.buildUrl(endpoint);
    const body = this.createBody(endpoint, request);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.abortSignal
    });

    const responseText = await response.text();
    let parsed: unknown;

    try {
      parsed = responseText ? JSON.parse(responseText) : undefined;
    } catch {
      parsed = responseText;
    }

    if (!response.ok) {
      const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      throw new Error(`Endpoint ${endpoint.name} returned ${response.status}: ${detail}`);
    }

    return {
      agentId: request.agent.id,
      agentName: request.agent.name,
      text: endpoint.apiKind === 'responses'
        ? this.extractResponsesText(parsed)
        : this.extractChatCompletionsText(parsed),
      raw: parsed
    };
  }

  private buildUrl(endpoint: EndpointConfig): string {
    const base = cleanBaseUrl(endpoint.baseUrl);
    const path = this.normalizePath(endpoint.apiPath?.trim() || this.defaultPath(endpoint.apiKind));
    const completePathPattern = /\/(?:chat\/completions|responses|completions)(?:\?|$)/i;
    const target = endpoint.apiPath?.trim() || !completePathPattern.test(base) ? `${base}${path}` : base;
    const url = new URL(target);

    if (endpoint.apiVersion && !url.searchParams.has('api-version')) {
      url.searchParams.set('api-version', endpoint.apiVersion);
    }

    return url.toString();
  }

  private defaultPath(apiKind: EndpointConfig['apiKind']): string {
    switch (apiKind) {
      case 'responses':
        return '/responses';
      case 'completions':
        return '/completions';
      case 'chat-completions':
      default:
        return '/chat/completions';
    }
  }

  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  private buildHeaders(endpoint: EndpointConfig, apiKey: string | undefined): HeadersInit {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...endpoint.defaultHeaders
    };

    if (endpoint.organization) {
      headers['OpenAI-Organization'] = endpoint.organization;
    }

    if (endpoint.authMode === 'bearer' && apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    if (endpoint.authMode === 'api-key' && apiKey) {
      headers['api-key'] = apiKey;
    }

    return headers;
  }

  private createBody(endpoint: EndpointConfig, request: AgentCallRequest): unknown {
    if (endpoint.apiKind === 'responses') {
      return this.createResponsesBody(request);
    }

    if (endpoint.apiKind === 'completions') {
      return this.createCompletionsBody(request);
    }

    return this.createChatCompletionsBody(request);
  }

  private createChatCompletionsBody(request: AgentCallRequest): unknown {
    const messages = this.createMessages(request);
    return {
      model: request.agent.model,
      messages,
      temperature: request.agent.temperature
    };
  }

  private createCompletionsBody(request: AgentCallRequest): unknown {
    const prompt = this.createMessages(request)
      .map(message => `${message.role.toUpperCase()}:\n${message.content}`)
      .join('\n\n');

    return {
      model: request.agent.model,
      prompt,
      temperature: request.agent.temperature
    };
  }

  private createResponsesBody(request: AgentCallRequest): unknown {
    const messages = this.createMessages(request);
    return {
      model: request.agent.model,
      input: messages.map(message => ({
        role: message.role,
        content: message.content
      })),
      temperature: request.agent.temperature
    };
  }

  private createMessages(request: AgentCallRequest): ChatMessage[] {
    if (request.messages?.length) {
      return request.messages;
    }

    return [
      {
        role: 'system',
        content: request.agent.systemPrompt
      },
      {
        role: 'user',
        content: request.input
      }
    ];
  }

  private extractChatCompletionsText(raw: unknown): string {
    const parsed = raw as ChatCompletionsResponse;
    const firstChoice = parsed.choices?.[0];
    const content = firstChoice?.message?.content ?? firstChoice?.text;

    if (Array.isArray(content)) {
      return content.map(part => part.text ?? '').join('').trim();
    }

    return String(content ?? '').trim();
  }

  private extractResponsesText(raw: unknown): string {
    const parsed = raw as ResponsesApiResponse;
    if (parsed.output_text) {
      return parsed.output_text.trim();
    }

    const text = parsed.output
      ?.flatMap(item => item.content ?? [])
      .map(content => content.text ?? '')
      .join('')
      .trim();

    return text ?? '';
  }
}
