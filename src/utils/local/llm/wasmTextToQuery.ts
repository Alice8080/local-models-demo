import { env, pipeline } from '@xenova/transformers';

const WASM_MODEL_ID = 'user808080/qwen2.5-0.5b-onnx';

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
env.backends.onnx.wasm.numThreads = 2;
env.backends.onnx.wasm.proxy = true;

let wasmGeneratorPromise: Promise<unknown> | null = null;
let fetchPatched = false;

async function patchTokenizerFetch() {
  if (fetchPatched) return;
  fetchPatched = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(`${WASM_MODEL_ID}/resolve/`) && url.endsWith('/tokenizer.json')) {
      const response = await originalFetch(input, init);
      try {
        const json = await response.clone().json();
        const normalizeMerges = (merges: unknown) => {
          if (!Array.isArray(merges)) return merges;
          return merges.map((entry) => {
            if (Array.isArray(entry)) {
              return entry.join(' ');
            }
            if (typeof entry === 'string') return entry;
            return String(entry);
          });
        };

        if (json?.model?.merges) {
          json.model.merges = normalizeMerges(json.model.merges);
        }
        if (json?.merges) {
          json.merges = normalizeMerges(json.merges);
        }

        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch {
        return response;
      }
    }
    return originalFetch(input, init);
  };
}

async function getWasmGenerator() {
  if (wasmGeneratorPromise) return wasmGeneratorPromise;
  await patchTokenizerFetch();

  const baseOptions = {
    device: 'wasm',
    revision: 'main',
    subfolder: 'onnx',
  } as Record<string, unknown>;

  wasmGeneratorPromise = pipeline('text-generation', WASM_MODEL_ID, {
    ...baseOptions,
    dtype: 'q8',
    model_file_name: 'model',
    use_external_data_format: false,
  } as Record<string, unknown>);

  try {
    return await wasmGeneratorPromise;
  } catch(err) {
    wasmGeneratorPromise = pipeline('text-generation', WASM_MODEL_ID, {
      ...baseOptions,
      dtype: 'fp32',
      model_file_name: 'model',
      use_external_data_format: true,
    } as Record<string, unknown>);
    return wasmGeneratorPromise;
  }
}

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

function extractJsonObject(value: string) {
  const start = value.indexOf('{');
  if (start === -1) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      const candidate = value.slice(start, i + 1).trim();
      try {
        const parsed = JSON.parse(candidate);
        return JSON.stringify(parsed);
      } catch {
        return '';
      }
    }
  }
  return '';
}

function buildStrictJsonPrompt(contextPrompt: string, text: string) {
  return `${contextPrompt}\n\nЗапрос: ${text}\nОтвет: {"filters":[`;
}

function finalizeJsonFromCompletion(raw: string) {
  const trimmed = raw.replace(/\u0000/g, '').trim();
  const direct = extractJsonObject(trimmed);
  if (direct) return direct;

  let segment = trimmed.replace(/^[^{"\[]+/, '');
  if (segment.startsWith('...')) {
    segment = segment.replace(/^\.{3}/, '');
  }

  const bracketIndex = segment.indexOf(']');
  if (bracketIndex !== -1) {
    const body = segment.slice(0, bracketIndex);
    const candidate = segment.trim().startsWith('[')
      ? `{"filters":${segment.slice(0, bracketIndex + 1)}}`
      : `{"filters":[${body}]}`;
    try {
      const parsed = JSON.parse(candidate);
      return JSON.stringify(parsed);
    } catch {
      return '';
    }
  }

  const braceIndex = segment.indexOf('}');
  if (braceIndex !== -1) {
    const body = segment.slice(0, braceIndex + 1).replace(/,\s*$/, '');
    const candidate = `{"filters":[${body}]}`;
    try {
      const parsed = JSON.parse(candidate);
      return JSON.stringify(parsed);
    } catch {
      return '';
    }
  }

  return '';
}

export async function runWasmTextToQuery(text: string, contextPrompt: string) {
  const safeText = toSafeText(text);
  const generator = (await getWasmGenerator()) as (
    input: unknown,
    options?: Record<string, unknown>,
  ) => Promise<Array<{ generated_text?: string }>>;

  const output = await generator(buildStrictJsonPrompt(contextPrompt, safeText), {
    max_new_tokens: 200,
    do_sample: false,
    temperature: 0,
    return_full_text: false,
  });
  const raw = output?.[0]?.generated_text ?? '';
  console.log({raw})
  return finalizeJsonFromCompletion(raw) || raw;
}
