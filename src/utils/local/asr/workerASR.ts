import { env, pipeline } from '@xenova/transformers';
import { env as ortEnv } from 'onnxruntime-web';

type Backend = 'webgpu' | 'wasm';

type WorkerRequest =
  | {
      id: number;
      type: 'transcribe';
      audio: Float32Array;
      backend: Backend;
      modelId: string;
      language?: string;
    }
  | {
      id: number;
      type: 'preload';
      backend: Backend;
      modelId: string;
      language?: string;
    };

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string }
  | {
      id: number;
      progress: {
        status: string;
        file: string;
        modelId: string;
        backend: Backend;
      };
    };

const transcriberCache = new Map<string, Promise<unknown>>();
const CHUNK_LENGTH_S = 25;
const STRIDE_LENGTH_S = 5;
const MAX_NEW_TOKENS = 128;

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '/{model}/resolve/{revision}';
ortEnv.logLevel = 'error';
ortEnv.debug = false;
env.backends.onnx.wasm.numThreads = Math.min(
  typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 4,
  4,
);
env.backends.onnx.wasm.proxy = false;

const backendsAny = (env as unknown as Record<string, any>).backends || {};
(env as unknown as Record<string, any>).backends = {
  ...backendsAny,
  onnx: {
    ...(backendsAny.onnx || {}),
    webgpu: { powerPreference: 'high-performance' },
  },
};

async function getTranscriber(
  backend: Backend,
  modelId: string,
  onProgress?: (data: {
    status?: string;
    name?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }) => void,
) {
  const cacheKey = `${backend}:${modelId}`;
  if (transcriberCache.has(cacheKey)) {
    return transcriberCache.get(cacheKey);
  }

  const loader = pipeline('automatic-speech-recognition', modelId, {
    device: backend === 'webgpu' ? 'webgpu' : 'wasm',
    dtype: backend === 'webgpu' ? 'float16' : 'float32',
    quantized: backend === 'wasm',
    revision: 'main',
    progress_callback: onProgress,
  } as Record<string, unknown>);

  transcriberCache.set(cacheKey, loader);
  return loader;
}

function extractText(result: unknown): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    const first = result[0] as { text?: string } | undefined;
    return first?.text ?? '';
  }
  return (result as { text?: string })?.text ?? '';
}

async function handlePreload(
  backend: Backend,
  modelId: string,
  onProgress?: (data: {
    status?: string;
    name?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }) => void,
) {
  await getTranscriber(backend, modelId, onProgress);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, backend, modelId, language } = event.data;

  let response: WorkerResponse;
  try {
    if (type === 'preload') {
      await handlePreload(backend, modelId, (data) => {
        const file = data?.file ?? data?.name ?? '';
        if (!file) return;
        self.postMessage({
          id,
          progress: {
            status: data?.status ?? 'progress',
            file,
            modelId,
            backend,
          },
        });
      });
      response = { id, result: '' };
    } else {
      const transcriber = (await getTranscriber(backend, modelId)) as (
        input: Float32Array,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      const result = await transcriber(event.data.audio, {
        language: language || undefined,
        task: 'transcribe',
        return_timestamps: false,
        chunk_length_s: CHUNK_LENGTH_S,
        stride_length_s: STRIDE_LENGTH_S,
        max_new_tokens: MAX_NEW_TOKENS,
      });
      response = { id, result: extractText(result) };
    }
  } catch (error) {
    response = { id, error: (error as Error).message ?? String(error) };
  }

  self.postMessage(response);
};
