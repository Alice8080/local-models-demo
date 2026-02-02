import React from 'react';

type Backend = 'webgpu' | 'wasm';

type UseSpeechRecognitionLocalOptions = {
  onResult: (transcript: string) => void;
  language?: string;
  modelId?: string;
};

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

type PendingRequest =
  | {
      kind: 'transcribe';
      resolve: (value: string) => void;
      reject: (reason?: unknown) => void;
    }
  | {
      kind: 'preload';
      resolve: () => void;
      reject: (reason?: unknown) => void;
      onProgress?: (progress: {
        status: string;
        file: string;
        modelId: string;
        backend: Backend;
      }) => void;
    };

const DEFAULT_MODEL_ID = 'Xenova/whisper-base';
const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(new URL('./workerASR.ts', import.meta.url), {
    type: 'module',
  });

  workerInstance.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const { id } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    if ('progress' in event.data) {
      if (pending.kind === 'preload') {
        pending.onProgress?.(event.data.progress);
      }
      return;
    }
    pendingRequests.delete(id);

    if ('error' in event.data) {
      pending.reject(new Error(event.data.error));
    } else {
      if (pending.kind === 'preload') {
        pending.resolve();
      } else {
        pending.resolve(event.data.result);
      }
    }
  };

  workerInstance.onerror = (event) => {
    const error = event instanceof ErrorEvent ? event.message : 'Worker error';
    pendingRequests.forEach(({ reject }) => reject(new Error(error)));
    pendingRequests.clear();
  };

  return workerInstance;
}

async function transcribeWithWorker(
  audio: Float32Array,
  backend: Backend,
  modelId: string,
  language?: string,
) {
  const worker = getWorker();
  const id = nextRequestId++;

  return new Promise<string>((resolve, reject) => {
    pendingRequests.set(id, { kind: 'transcribe', resolve, reject });
    const request: WorkerRequest = { id, type: 'transcribe', audio, backend, modelId, language };
    worker.postMessage(request, [audio.buffer]);
  });
}

export async function preloadSpeechRecognitionLocal(options?: {
  backend?: Backend;
  modelId?: string;
  language?: string;
  onProgress?: (progress: {
    status: string;
    file: string;
    modelId: string;
    backend: Backend;
  }) => void;
}) {
  const selectedBackend = options?.backend ?? (hasWebGPU ? 'webgpu' : 'wasm');
  const selectedModelId = options?.modelId ?? DEFAULT_MODEL_ID;
  const worker = getWorker();
  const id = nextRequestId++;

  return new Promise<void>((resolve, reject) => {
    pendingRequests.set(id, {
      kind: 'preload',
      resolve,
      reject,
      onProgress: options?.onProgress,
    });
    const request: WorkerRequest = {
      id,
      type: 'preload',
      backend: selectedBackend,
      modelId: selectedModelId,
      language: options?.language,
    };
    worker.postMessage(request);
  });
}

async function decodeToPCM16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  await audioCtx.close().catch(() => undefined);

  const targetRate = 16000;
  if (decoded.sampleRate === targetRate) {
    return new Float32Array(decoded.getChannelData(0));
  }

  if (typeof OfflineAudioContext !== 'undefined') {
    const duration = decoded.duration;
    const frameCount = Math.ceil(duration * targetRate);
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const resampled = await offline.startRendering();
    return new Float32Array(resampled.getChannelData(0));
  }

  const channel = decoded.getChannelData(0);
  const ratio = decoded.sampleRate / targetRate;
  const outLength = Math.ceil(channel.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, channel.length - 1);
    const t = srcIndex - i0;
    out[i] = channel[i0] * (1 - t) + channel[i1] * t;
  }
  return out;
}

export function useSpeechRecognitionLocal({
  onResult,
  language = 'ru',
  modelId = DEFAULT_MODEL_ID,
}: UseSpeechRecognitionLocalOptions) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = React.useState(true);
  const [spokenText, setSpokenText] = React.useState('');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaChunksRef = React.useRef<Array<Blob>>([]);
  const backend = hasWebGPU ? 'webgpu' : 'wasm';

  React.useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined' &&
      typeof AudioContext !== 'undefined';
    setIsVoiceSupported(supported);
  }, []);

  const stopRecording = React.useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
  }, []);

  const startRecording = React.useCallback(async () => {
    if (!isVoiceSupported) {
      setVoiceError('Голосовой ввод не поддерживается браузером.');
      return;
    }
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(mediaChunksRef.current, { type: mimeType || 'audio/webm' });
        mediaChunksRef.current = [];
        if (!blob.size) return;

        try {
          const pcm = await decodeToPCM16k(blob);
          let transcript = await transcribeWithWorker(pcm, backend, modelId, language);
          if (!transcript && backend === 'webgpu') {
            transcript = await transcribeWithWorker(pcm, 'wasm', modelId, language);
          }
          setSpokenText(transcript);
          setVoiceError(null);
          onResult(transcript);
        } catch (error) {
          setVoiceError(
            `Не удалось распознать речь: ${(error as Error).message ?? String(error)}`,
          );
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceError(null);
      setIsRecording(true);
    } catch (error) {
      setVoiceError(
        `Не удалось получить доступ к микрофону: ${(error as Error).message ?? String(error)}`,
      );
      setIsRecording(false);
    }
  }, [backend, isRecording, isVoiceSupported, language, modelId, onResult]);

  React.useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    isVoiceSupported,
    spokenText,
    voiceError,
    setVoiceError,
    startRecording,
    stopRecording,
  };
}