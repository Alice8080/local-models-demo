import { env, pipeline } from '@xenova/transformers';

type Backend = 'webgpu' | 'wasm';

type WorkerRequest = {
  id: number;
  type: 'transcribe';
  audio: Float32Array;
  backend: Backend;
  modelId: string;
  language?: string;
};

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string };

const transcriberCache = new Map<string, Promise<unknown>>();
const CHUNK_LENGTH_S = 25;
const STRIDE_LENGTH_S = 5;
const MAX_NEW_TOKENS = 128;

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '/{model}/resolve/{revision}';
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

async function getTranscriber(backend: Backend, modelId: string) {
  const cacheKey = `${backend}:${modelId}`;
  if (transcriberCache.has(cacheKey)) {
    return transcriberCache.get(cacheKey);
  }

  const loader = pipeline('automatic-speech-recognition', modelId, {
    device: backend === 'webgpu' ? 'webgpu' : 'wasm',
    dtype: backend === 'webgpu' ? 'float16' : 'float32',
    quantized: backend === 'wasm',
    revision: 'main',
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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, audio, backend, modelId, language } = event.data;
  if (type !== 'transcribe') return;

  let response: WorkerResponse;
  try {
    const transcriber = (await getTranscriber(backend, modelId)) as (
      input: Float32Array,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
    const result = await transcriber(audio, {
      language: language || undefined,
      task: 'transcribe',
      return_timestamps: false,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
      max_new_tokens: MAX_NEW_TOKENS,
    });
    response = { id, result: extractText(result) };
  } catch (error) {
    response = { id, error: (error as Error).message ?? String(error) };
  }

  self.postMessage(response);
};
