import { useEffect, useRef, useState } from 'react';
import { AudioOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Divider, Flex, Space, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';

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

export function OnlineInputAudio({
  setQuery,
}: {
  setQuery: (query: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(true);
  const [spokenText, setSpokenText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
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
      setSpokenText(transcript);
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

  const handleFileChange = (file: UploadFile) => {
    if (file.status === 'removed') {
      setUploadedFileName(null);
      setAudioUrl(null);
    }
  };

  const handleBeforeUpload = (file: File) => {
    setUploadedFileName(file.name);
    const nextUrl = URL.createObjectURL(file);
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
    return false;
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <div>
      <Divider titlePlacement="start">
        <span className="font-bold">Голосовой ввод</span>
      </Divider>
      <Space size="large" vertical>
        <Flex align="start" justify="start" gap="middle">
          <Space direction="vertical" size="middle">
            <Space>
              <Upload
                accept="audio/*"
                showUploadList={false}
                beforeUpload={handleBeforeUpload}
                onChange={({ file }) => handleFileChange(file)}
              >
                <Button>Загрузить аудио</Button>
              </Upload>
            </Space>
          </Space>
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
          <Typography.Text>
            {spokenText ? spokenText : ''}
          </Typography.Text>
        </Flex>
        <Flex gap="middle" vertical>
          <Typography.Text>
            {uploadedFileName
              ? `Выбран файл: ${uploadedFileName}.`
              : 'Файл не выбран.'}
          </Typography.Text>
          {audioUrl && <audio controls src={audioUrl} className="w-fit" />}
        </Flex>
      </Space>
    </div>
  );
}
