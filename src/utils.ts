export function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function cleanBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function coerceTemperature(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.min(2, Math.max(0, numberValue));
}

export function parseJsonObject<T>(text: string): T | undefined {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1].trim()) as T;
      } catch {
        return undefined;
      }
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}
