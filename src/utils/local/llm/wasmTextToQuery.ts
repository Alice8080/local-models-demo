import { ModelManager, Wllama, type Model } from '@wllama/wllama';
import wllamaSingle from '@wllama/wllama/src/single-thread/wllama.wasm?url';
import wllamaMulti from '@wllama/wllama/src/multi-thread/wllama.wasm?url';

type RunWasmOptions = {
  onPartial?: (value: string) => void;
  timeoutMs?: number;
};

const MODEL_URL = (import.meta.env.VITE_WLLAMA_MODEL_URL as string | undefined) ?? '';
if (!MODEL_URL) {
  throw new Error('VITE_WLLAMA_MODEL_URL is not set');
}
const WLLAMA_CONFIG_PATHS = {
  'single-thread/wllama.wasm': wllamaSingle,
  'multi-thread/wllama.wasm': wllamaMulti,
};

const modelManager = new ModelManager();
let wllamaInstance: Wllama | null = null;
let loadPromise: Promise<void> | null = null;

const ensureDocumentShim = () => {
  if (typeof document !== 'undefined') return;
  const base = typeof self !== 'undefined' && self.location ? self.location.href : '';
  (globalThis as { document?: { baseURI: string; URL: string } }).document = {
    baseURI: base,
    URL: base,
  };
};

const getCpuThreads = () => {
  const concurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, Math.min(concurrency, 4));
};

const buildChatPrompt = (systemPrompt: string, userText: string) =>
  [
    `<|im_start|>system\n${systemPrompt.trim()}<|im_end|>\n`,
    `<|im_start|>user\n${userText}<|im_end|>\n`,
    '<|im_start|>assistant\n',
  ].join('');

const toSafeText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractJsonObject = (value: string) => {
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
};

const stripCodeFences = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```$/, '').trim();
};

const normalizeJsonResult = (value: unknown) => {
  if (Array.isArray(value)) {
    return JSON.stringify({ filters: value });
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.filters)) {
      return JSON.stringify({ filters: record.filters });
    }
  }
  return '';
};

const finalizeJsonFromCompletion = (raw: string) => {
  const trimmed = stripCodeFences(raw.replace(/\u0000/g, '')).trim();
  try {
    const parsed = JSON.parse(trimmed);
    const normalized = normalizeJsonResult(parsed);
    if (normalized) return normalized;
  } catch {
    // ignore, continue with heuristic parsing
  }

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
      return normalizeJsonResult(parsed);
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
      return normalizeJsonResult(parsed);
    } catch {
      return '';
    }
  }

  return '';
};

async function getCachedOrDownloadModel(): Promise<Model> {
  const cached = (await modelManager.getModels()).find(
    (model) => model.url === MODEL_URL,
  );
  if (cached) return cached;
  return modelManager.downloadModel(MODEL_URL);
}

async function ensureModelLoaded() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (!wllamaInstance) {
      ensureDocumentShim();
      wllamaInstance = new Wllama(WLLAMA_CONFIG_PATHS);
    }
    const model = await getCachedOrDownloadModel();
    await wllamaInstance.loadModel(model, {
      n_threads: getCpuThreads(),
      n_ctx: 2048,
      n_batch: 128,
    });
  })();

  try {
    await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

export async function runWasmTextToQuery(
  text: string,
  contextPrompt: string,
  options: RunWasmOptions = {},
): Promise<string> {
  await ensureModelLoaded();
  if (!wllamaInstance) {
    throw new Error('Wllama instance is not initialized');
  }

  const prompt = buildChatPrompt(contextPrompt, toSafeText(text));
  let timedOut = false;
  let timeoutId: number | undefined;

  if (options.timeoutMs && options.timeoutMs > 0) {
    timeoutId = self.setTimeout(() => {
      timedOut = true;
    }, options.timeoutMs);
  }

  const result = await wllamaInstance.createCompletion(prompt, {
    nPredict: 256,
    useCache: true,
    sampling: {
      temp: 0,
    },
    onNewToken(_token, _piece, currentText, optionals) {
      options.onPartial?.(currentText);
      if (timedOut) {
        optionals.abortSignal();
      }
    },
  });

  if (timeoutId) {
    self.clearTimeout(timeoutId);
  }

  if (timedOut) {
    throw new Error('Wllama generation timed out');
  }

  return finalizeJsonFromCompletion(result) || result;
}


