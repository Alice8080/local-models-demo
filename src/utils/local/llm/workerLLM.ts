import { preloadWasmTextToQueryModel, runWasmTextToQuery } from './wasm';
import {
  hasWebGPU,
  preloadWebGpuModel,
  runWebGpuTextToQuery,
} from './webGPU';

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
    return runWebGpuTextToQuery(safeText);
  }

  return runWasmTextToQuery(safeText, requiredWasmContextPrompt, {
    onPartial,
    timeoutMs: 120000,
  });
}

async function handlePreload(backend: 'webgpu' | 'wasm', onProgress?: (info: { file: string }) => void) {
  if (backend === 'webgpu') {
    if (!hasWebGPU) return;
    await preloadWebGpuModel((file) => {
      onProgress?.({ file });
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
