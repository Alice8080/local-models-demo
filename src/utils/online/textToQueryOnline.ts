import type { QueryFilter, QueryParams } from '../buildQueryString';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL as
  | string
  | undefined;
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as
  | string
  | undefined;

const prompt = import.meta.env.VITE_SYSTEM_PROMPT ?? '';
const SYSTEM_PROMPT = prompt.trim() || '';

const isQueryParams = (value: unknown): value is QueryParams => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.filters)) return false;
  return record.filters.every((filter) => {
    if (!filter || typeof filter !== 'object') return false;
    const filterRecord = filter as Record<string, unknown>;
    return (
      typeof filterRecord.field === 'string' &&
      typeof filterRecord.op === 'string' &&
      'value' in filterRecord
    );
  });
};

const extractJsonObject = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    return candidate;
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return candidate.slice(start, end + 1);
  }
  return null;
};

export async function textToQueryOnline(
  text: string,
  options: { signal?: AbortSignal } = {},
): Promise<QueryFilter[]> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('VITE_OPENROUTER_API_KEY is not set');
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Local Models Demo',
    },
    signal: options.signal,
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed: ${errorText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content ?? '';
  const jsonText = extractJsonObject(content);
  if (!jsonText) {
    return [];
  }
  try {
    const parsed = JSON.parse(jsonText) as QueryParams;
    if (isQueryParams(parsed)) {
      return parsed.filters;
    }
  } catch {
    // fall through
  }

  return [];
}
