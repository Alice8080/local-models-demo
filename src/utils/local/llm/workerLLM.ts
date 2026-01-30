import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';

type WorkerRequest = {
  id: number;
  text: string;
};

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string };

const MODEL_URL = import.meta.env.VITE_MODEL_URL as string | undefined;
const MODEL_LIB_URL = import.meta.env.VITE_MODEL_LIB_URL as string | undefined;
if (!MODEL_URL || !MODEL_LIB_URL) {
  throw new Error('VITE_MODEL_URL or VITE_MODEL_LIB_URL is not set');
}
console.log(MODEL_URL, MODEL_LIB_URL)

let enginePromise: ReturnType<typeof CreateMLCEngine> | null = null;

async function getEngine() {
  if (enginePromise) return enginePromise;

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
console.log(contextPrompt);
if (!contextPrompt) {
  throw new Error('VITE_SYSTEM_PROMPT_LOCAL is not set');
}

async function handleRequest(text: string) {
  const engine = await getEngine();
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: contextPrompt ?? ''
    },
    { role: 'user', content: text },
  ];

  const res = await engine.chat.completions.create({ messages });
  return res.choices?.[0]?.message?.content ?? '';
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, text } = event.data;
  let response: WorkerResponse;

  try {
    const result = await handleRequest(text);
    response = { id, result };
  } catch (error) {
    response = { id, error: String(error) };
  }

  self.postMessage(response);
};
