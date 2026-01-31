import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { runWasmTextToQuery } from './wasmTextToQuery';

type WorkerRequest = {
  id: number;
  text: string;
};

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string };

const MODEL_URL = import.meta.env.VITE_MODEL_URL as string | undefined;
const MODEL_LIB_URL = import.meta.env.VITE_MODEL_LIB_URL as string | undefined;
const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

let enginePromise: ReturnType<typeof CreateMLCEngine> | null = null;

async function getEngine() {
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

  enginePromise = CreateMLCEngine(modelId, { appConfig });
  return enginePromise;
}

const contextPrompt = import.meta.env.VITE_SYSTEM_PROMPT_LOCAL as string | undefined;
if (!contextPrompt) {
  throw new Error('VITE_SYSTEM_PROMPT_LOCAL is not set');
}
const requiredContextPrompt = contextPrompt;
const wasmContextPrompt = `${requiredContextPrompt}\n\nСтрогий формат для WASM: верни только валидный JSON-объект {"filters":[...]} без текста, без кода, без Markdown, без пояснений.`;

function toSafeText(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function handleRequest(text: string) {
  const safeText = toSafeText(text);

  if (hasWebGPU) {
    const engine = await getEngine();
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: requiredContextPrompt,
      },
      { role: 'user', content: safeText },
    ];

    const res = await engine.chat.completions.create({ messages });
    return res.choices?.[0]?.message?.content ?? '';
  }

  return runWasmTextToQuery(safeText, wasmContextPrompt);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, text } = event.data;
  let response: WorkerResponse;

  try {
    const result = await handleRequest(text);
    response = { id, result };
  } catch (error) {
    if (hasWebGPU) {
      try {
        const result = await runWasmTextToQuery(toSafeText(text), wasmContextPrompt);
        response = { id, result };
      } catch (fallbackError) {
        console.error(fallbackError);
        response = { id, error: String(fallbackError) };
      }
    } else {
      response = { id, error: String(error) };
    }
  }

  self.postMessage(response);
};
