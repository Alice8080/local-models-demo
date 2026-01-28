import { useEffect, useRef, useState } from 'react';
import { AudioOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Divider, Flex, Input, Space, Typography } from 'antd';

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

export function InputAudio({ setQuery }: { setQuery: (query: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setIsVoiceSupported(Boolean(SpeechRecognitionClass));
  }, []);

  const handleStartRecording = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setIsVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setQuery(transcript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const handleStopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <div>
      <Divider titlePlacement="start">
        <span className="font-bold">Голосовой ввод</span>
      </Divider>
      <Space>
        <Button
          icon={isRecording ? <StopOutlined /> : <AudioOutlined />}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!isVoiceSupported}
        >
          {isRecording ? 'Остановить запись' : 'Начать запись'}
        </Button>
        {!isVoiceSupported && (
          <Typography.Text type="secondary">
            Голосовой ввод не поддерживается браузером.
          </Typography.Text>
        )}
      </Space>
    </div>
  );
}
