import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';

const MODEL_URL = import.meta.env.VITE_MODEL_URL as string | undefined;
const MODEL_LIB_URL = import.meta.env.VITE_MODEL_LIB_URL as string | undefined;
export const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

let enginePromise: ReturnType<typeof CreateMLCEngine> | null = null;

const contextPrompt = import.meta.env.VITE_SYSTEM_PROMPT_LOCAL as
  | string
  | undefined;
if (!contextPrompt) {
  throw new Error('VITE_SYSTEM_PROMPT_LOCAL is not set');
}

const requiredContextPrompt = contextPrompt;

function toSafeText(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function getEngine(onProgress?: (text: string) => void) {
  if (enginePromise) return enginePromise;
  if (!MODEL_URL || !MODEL_LIB_URL) {
    throw new Error('VITE_MODEL_URL or VITE_MODEL_LIB_URL is not set');
  }

  const cacheKey = `${MODEL_URL}|${MODEL_LIB_URL}|v2`;
  const modelId = `custom-qwen25-${btoa(cacheKey)
    .replace(/=+/g, '')
    .slice(0, 12)}`;

  const appConfig = {
    model_list: [
      {
        model_id: modelId,
        model: MODEL_URL ?? '',
        model_lib: MODEL_LIB_URL ?? '',
      },
    ],
  };

  enginePromise = CreateMLCEngine(modelId, {
    appConfig,
    initProgressCallback: onProgress
      ? (report) => {
          onProgress(report.text);
        }
      : undefined,
  });
  return enginePromise;
}

export async function preloadWebGpuModel(onProgress?: (file: string) => void) {
  if (!hasWebGPU) return;
  await getEngine((text) => {
    if (!text) return;
    onProgress?.(text);
  });
}

export async function runWebGpuTextToQuery(text: string) {
  if (!hasWebGPU) {
    throw new Error('WebGPU is not available');
  }

  const engine = await getEngine();
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: requiredContextPrompt,
    },
    { role: 'user', content: toSafeText(text) },
  ];

  const res = await engine.chat.completions.create({ messages });
  return res.choices?.[0]?.message?.content ?? '';
}
