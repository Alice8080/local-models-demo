import type { QueryFilter, QueryParams } from "@/utils/buildQueryString";

export async function textToQueryLocal(text: string): Promise<QueryFilter[]> {
  const worker = getWorker();
  const id = nextRequestId++;

  return new Promise<QueryFilter[]>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Local LLM timed out"));
    }, 120000);
    pendingRequests.set(id, { resolve, reject, timeoutId });
    worker.postMessage({ id, text });
  });
}

type PendingRequest = {
  resolve: (value: QueryFilter[]) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

type WorkerResponse =
  | { id: number; result: string }
  | { id: number; error: string }
  | { id: number; partial: string };

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
    if ("partial" in event.data) {
      console.log(event.data.partial);
      return;
    }

    pendingRequests.delete(id);
    clearTimeout(pending.timeoutId);

    if ("error" in event.data) {
      pending.reject(new Error(event.data.error));
    } else {
      pending.resolve(parseFilters(event.data.result));
    }
  };

  workerInstance.onerror = (event) => {
    const error = event instanceof ErrorEvent ? event.message : "Worker error";
    pendingRequests.forEach(({ reject }) => reject(new Error(error)));
    pendingRequests.clear();
  };

  return workerInstance;
}