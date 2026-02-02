import type { QueryFilter, QueryParams } from "@/utils/buildQueryString";

export async function textToQueryLocal(text: string): Promise<QueryFilter[]> {
  const worker = getWorker();
  const id = nextRequestId++;

  return new Promise<QueryFilter[]>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Local LLM timed out"));
    }, 120000);
    pendingRequests.set(id, { kind: "query", resolve, reject, timeoutId });
    worker.postMessage({ id, type: "run", text });
  });
}

type PendingRequest =
  | {
      kind: "query";
      resolve: (value: QueryFilter[]) => void;
      reject: (reason?: unknown) => void;
      timeoutId: number;
    }
  | {
      kind: "preload";
      resolve: () => void;
      reject: (reason?: unknown) => void;
      timeoutId: number;
      onProgress?: (progress: {
        source: "llm-wasm" | "llm-webgpu";
        file: string;
      }) => void;
    };

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string }
  | { id: number; partial: string }
  | {
      id: number;
      progress: {
        source: "llm-wasm" | "llm-webgpu";
        file: string;
      };
    };

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

const isQueryParams = (value: unknown): value is QueryParams => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.filters)) return false;
  return record.filters.every((filter) => {
    if (!filter || typeof filter !== "object") return false;
    const filterRecord = filter as Record<string, unknown>;
    return (
      typeof filterRecord.field === "string" &&
      typeof filterRecord.op === "string" &&
      "value" in filterRecord
    );
  });
};

function sanitize(payload: string): string {
  return payload
    .replace(/opValue/g, 'value')
    .replace(/\.\}/g, '}')
    .replace(/\}\]\]/g, '}]}');
}

const parseFilters = (payload: string): QueryFilter[] => {
  try {
    const sanitizedPayload = sanitize(payload);
    const parsed = JSON.parse(sanitizedPayload) as QueryParams;
    return isQueryParams(parsed) ? parsed.filters : [];
  } catch {
    return [];
  }
};

function getWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(new URL("./workerLLM.ts", import.meta.url), {
    type: "module",
  });

  workerInstance.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const { id } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    if ("progress" in event.data) {
      if (pending.kind === "preload") {
        pending.onProgress?.(event.data.progress);
      }
      return;
    }
    if ("partial" in event.data) {
      return;
    }

    pendingRequests.delete(id);
    clearTimeout(pending.timeoutId);

    if ("error" in event.data) {
      pending.reject(new Error(event.data.error));
    } else {
      if (pending.kind === "preload") {
        pending.resolve();
      } else {
        pending.resolve(parseFilters(event.data.result));
      }
    }
  };

  workerInstance.onerror = (event) => {
    const error = event instanceof ErrorEvent ? event.message : "Worker error";
    pendingRequests.forEach(({ reject }) => reject(new Error(error)));
    pendingRequests.clear();
  };

  return workerInstance;
}

async function preloadLocalLlm(
  backend: "webgpu" | "wasm",
  onProgress?: (progress: {
    source: "llm-wasm" | "llm-webgpu";
    file: string;
  }) => void
) {
  const worker = getWorker();
  const id = nextRequestId++;

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Local LLM preload timed out"));
    }, 120000);
    pendingRequests.set(id, {
      kind: "preload",
      resolve,
      reject,
      timeoutId,
      onProgress,
    });
    worker.postMessage({ id, type: "preload", backend });
  });
}

export async function preloadLocalLlmModels(options?: {
  onProgress?: (progress: {
    source: "llm-wasm" | "llm-webgpu";
    file: string;
  }) => void;
}) {
  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
  if (hasWebGPU) {
    try {
      await preloadLocalLlm("webgpu", options?.onProgress);
    } catch (error) {
      console.warn("WebGPU preload failed, fallback to WASM:", error);
    }
  } else {
    await preloadLocalLlm("wasm", options?.onProgress);
  }
}