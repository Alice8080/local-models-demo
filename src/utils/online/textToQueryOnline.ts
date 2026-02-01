import OpenAI from 'openai';

import type { QueryFilter, QueryParams } from '../buildQueryString';

const baseURL = import.meta.env.VITE_PROVIDER_URL as string | undefined;
const model = import.meta.env.VITE_MODEL as string | undefined;
const apiKey = import.meta.env.VITE_API_KEY as string | undefined;

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

  if (!baseURL || !apiKey || !model) {
    throw new Error('Required environment variables are not set');
  }

  const defaultHeaders: Record<string, string> = {
    'X-Title': 'Local Models Demo',
  };
  if (typeof window !== 'undefined') {
    defaultHeaders['HTTP-Referer'] = window.location.origin;
  }

  const client = new OpenAI({
    baseURL,
    apiKey,
    defaultHeaders,
    dangerouslyAllowBrowser: true,
  });

  const completion = await client.chat.completions.create(
    {
      model,
      messages: [
        {
          role: 'user',
          content: `${SYSTEM_PROMPT}. Запрос: ${text}`,
        },
      ],
      temperature: 0.1,
      stream: false,
    },
    {
      signal: options.signal,
    },
  );

  const content = completion.choices?.[0]?.message?.content ?? '';
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
    throw new Error('Failed to parse response as JSON');
  }

  return [];
}
