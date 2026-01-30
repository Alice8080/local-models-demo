import React from 'react';

type SpeechRecognitionInstance = {
  start: () => void;
  stop: () => void;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type UseSpeechRecognitionOnlineOptions = {
  onResult: (transcript: string) => void;
  language?: string;
  offlineMessage?: string;
};

export function useSpeechRecognitionOnline({
  onResult,
  language = 'ru-RU',
  offlineMessage,
}: UseSpeechRecognitionOnlineOptions) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = React.useState(true);
  const [spokenText, setSpokenText] = React.useState('');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setIsVoiceSupported(Boolean(SpeechRecognitionClass));
  }, []);

  const isOnline = () =>
    typeof navigator === 'undefined' ? true : navigator.onLine;

  const startRecording = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!isOnline()) {
      setVoiceError(offlineMessage ?? null);
      setSpokenText('');
      setIsRecording(false);
      return;
    }
    const SpeechRecognitionClass =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setIsVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setSpokenText(transcript);
      setVoiceError(null);
      onResult(transcript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setIsRecording(true);
    recognition.start();
  }, [language, offlineMessage, onResult]);

  const stopRecording = React.useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

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
