import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { preloadWasmTextToQueryModel, runWasmTextToQuery } from './wasm';

type WorkerRequest =
  | {
      id: number;
      type: 'run';
      text: string;
    }
  | {
      id: number;
      type: 'preload';
      backend: 'webgpu' | 'wasm';
    };

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string }
  | { id: number; partial: string }
  | {
      id: number;
      progress: {
        source: 'llm-wasm' | 'llm-webgpu';
        file: string;
      };
    };

const MODEL_URL = import.meta.env.VITE_MODEL_URL as string | undefined;
const MODEL_LIB_URL = import.meta.env.VITE_MODEL_LIB_URL as string | undefined;
const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

let enginePromise: ReturnType<typeof CreateMLCEngine> | null = null;

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

const contextPrompt = import.meta.env.VITE_SYSTEM_PROMPT_LOCAL as
  | string
  | undefined;
if (!contextPrompt) {
  throw new Error('VITE_SYSTEM_PROMPT_LOCAL is not set');
}

const requiredContextPrompt = contextPrompt;
const wasmContextPrompt = import.meta.env.VITE_SYSTEM_PROMPT_LOCAL_WASM as
  | string
  | undefined;
if (!wasmContextPrompt) {
  throw new Error('VITE_SYSTEM_PROMPT_LOCAL_WASM is not set');
}

const requiredWasmContextPrompt = wasmContextPrompt;

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

async function handleRequest(
  text: string,
  onPartial?: (value: string) => void,
) {
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

  return runWasmTextToQuery(safeText, requiredWasmContextPrompt, {
    onPartial,
    timeoutMs: 120000,
  });
}

async function handlePreload(backend: 'webgpu' | 'wasm', onProgress?: (info: { file: string }) => void) {
  if (backend === 'webgpu') {
    if (!hasWebGPU) return;
    await getEngine((text) => {
      if (!text) return;
      onProgress?.({ file: text });
    });
    return;
  }

  await preloadWasmTextToQueryModel(onProgress);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type } = event.data;
  let response: WorkerResponse;

  try {
    if (type === 'preload') {
      const backend = event.data.backend;
      await handlePreload(backend, (progress) => {
        self.postMessage({
          id,
          progress: {
            source: backend === 'webgpu' ? 'llm-webgpu' : 'llm-wasm',
            file: progress.file,
          },
        });
      });
      response = { id, result: '' };
    } else {
      const result = await handleRequest(event.data.text, (partial) => {
        self.postMessage({ id, partial });
      });
      response = { id, result };
    }
  } catch (error) {
    if (type !== 'preload' && hasWebGPU) {
      try {
        const result = await runWasmTextToQuery(
          toSafeText(event.data.text),
          requiredWasmContextPrompt,
          {
            onPartial: (partial) => {
              self.postMessage({ id, partial });
            },
            timeoutMs: 120000,
          },
        );
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
