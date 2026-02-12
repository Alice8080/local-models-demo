import React from 'react';
import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { BubbleListProps } from '@ant-design/x';
import { Bubble, Sender } from '@ant-design/x';
import { Flex, Modal, Typography } from 'antd';

import { textToQueryOnline } from '@/utils/online/textToQueryOnline';
import {
  preloadLocalLlmModels,
  textToQueryLocal,
} from '@/utils/local/llm/textToQueryLocal';
import { buildQueryString } from '@/utils/query';
import { useSpeechRecognitionOnline } from '@/utils/online/useSpeechRecognitionOnline';
import {
  preloadSpeechRecognitionLocal,
  useSpeechRecognitionLocal,
} from '@/utils/local/asr/useSpeechRecognitionLocal';
import type { Mode } from '@/pages/Page';

const useLocale = () => {
  return {
    addUserMessage: 'Добавить сообщение пользователя',
    addAIMessage: 'Добавить ответ модели',
    addSystemMessage: 'Добавить системное сообщение',
    editLastMessage: 'Редактировать последнее сообщение',
    placeholder: 'Введите текст и нажмите Enter, чтобы отправить сообщение',
    waiting: 'Пожалуйста, подождите...',
    requestFailed: 'Запрос не выполнен, попробуйте ещё раз.',
    requestAborted: 'Запрос отменён',
    noMessages: 'Сообщений пока нет, задайте вопрос',
    requesting: 'Запрос выполняется',
    qaCompleted: 'Ответ получен',
    requestSucceeded: 'Запрос выполнен',
    retry: 'Повторить',
    currentStatus: 'Текущий статус:',
    newUserMessage: 'Новое сообщение пользователя',
    newAIResponse: 'Новый ответ модели',
    newSystemMessage: 'Новое системное сообщение',
    editMessage: 'Сообщение изменено',
    developerMessage:
      'Вы — помощник, который отвечает на вопросы пользователя.',
    voiceUnsupported: 'Голосовой ввод не поддерживается браузером.',
    textOffline: 'Нет подключения к интернету. Текстовый запрос не отправлен.',
    voiceOffline: 'Нет подключения к интернету. Голосовой ввод недоступен.',
    voiceProcessing: 'Обработка аудиозаписи...',
  };
};

type ChatMessage = {
  id: number;
  message: { role: 'assistant' | 'user' | 'system'; content: string };
  status: 'success' | 'loading' | 'error';
  severity?: 'error' | 'warning';
};

// Message role configuration: define layout and rendering for assistant and user messages
const role: BubbleListProps['role'] = {
  assistant: {
    placement: 'start',
    contentRender(content: string | React.ReactNode) {
      return content;
    },
  },
  user: {
    placement: 'end',
  },
};

const LOCAL_MODEL_PROMPT_KEY = 'localModelsAccepted';

const readLocalModelConsent = () => {
  try {
    return localStorage.getItem(LOCAL_MODEL_PROMPT_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeLocalModelConsent = () => {
  try {
    localStorage.setItem(LOCAL_MODEL_PROMPT_KEY, 'true');
  } catch {
    // ignore storage errors
  }
};

export function Chat({
  mode,
  setParams,
}: {
  mode: Mode;
  setParams: (params: string) => void;
}) {
  const [content, setContent] = React.useState('');
  const locale = useLocale();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = React.useState(false);
  const [isLocalModelModalOpen, setIsLocalModelModalOpen] =
    React.useState(false);
  const [isLocalModelLoading, setIsLocalModelLoading] = React.useState(false);
  const [localModelLoadError, setLocalModelLoadError] =
    React.useState<string | null>(null);
  const [localModelDownloadFile, setLocalModelDownloadFile] =
    React.useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const isOnline = () =>
    typeof navigator === 'undefined' ? true : navigator.onLine;

  const appendErrorMessage = (
    userText: string,
    errorText: string,
    severity: ChatMessage['severity'],
  ) => {
    const userMessage: ChatMessage = {
      id: Date.now(),
      message: { role: 'user', content: userText },
      status: 'success',
    };
    const assistantMessage: ChatMessage = {
      id: Date.now() + 1,
      message: { role: 'assistant', content: errorText },
      status: 'error',
      severity,
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
  };

  const onlineSpeech = useSpeechRecognitionOnline({
    onResult: (transcript) => {
      setIsVoiceProcessing(false);
      void sendQuery(transcript, 'voice');
    },
    offlineMessage: locale.voiceOffline,
  });

  const localSpeech = useSpeechRecognitionLocal({
    onResult: (transcript) => {
      setIsVoiceProcessing(false);
      void sendQuery(transcript, 'voice');
    },
  });

  const {
    isRecording,
    isVoiceSupported,
    spokenText,
    voiceError,
    setVoiceError,
    startRecording,
    stopRecording,
  } = mode === 'online' ? onlineSpeech : localSpeech;

  const handleRecordingChange = (recording: boolean) => {
    if (recording) {
      setIsVoiceProcessing(false);
      startRecording();
    } else {
      if (isRecording) {
        setIsVoiceProcessing(true);
      }
      stopRecording();
    }
  };

  React.useEffect(() => {
    if (voiceError) {
      setIsVoiceProcessing(false);
    }
  }, [voiceError]);

  const preloadLocalModels = React.useCallback(
    async (showErrors: boolean) => {
      setIsLocalModelLoading(true);
      setLocalModelLoadError(null);
      setLocalModelDownloadFile(null);
      try {
        await Promise.all([
          preloadSpeechRecognitionLocal({
            onProgress: (progress) => {
              setLocalModelDownloadFile(`ASR: ${progress.file}`);
            },
          }),
          preloadLocalLlmModels({
            onProgress: (progress) => {
              const label =
                progress.source === 'llm-webgpu'
                  ? `LLM WebGPU: ${progress.file}`
                  : `LLM WASM: ${progress.file}`;
              setLocalModelDownloadFile(label);
            },
          }),
        ]);
      } catch (error) {
        if (showErrors) {
          setLocalModelLoadError(
            error instanceof Error ? error.message : String(error),
          );
        } else {
          console.warn('Local model preload failed:', error);
        }
      } finally {
        setIsLocalModelLoading(false);
        setLocalModelDownloadFile(null);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (mode === 'local') {
      const hasConsent = readLocalModelConsent();
      setIsLocalModelModalOpen(!hasConsent);
      if (hasConsent) {
        void preloadLocalModels(false);
      }
    } else {
      setIsLocalModelModalOpen(false);
      setIsLocalModelLoading(false);
      setLocalModelLoadError(null);
    }
  }, [mode, preloadLocalModels]);

  const handleLocalModelOk = async () => {
    setIsLocalModelModalOpen(false);
    writeLocalModelConsent();
    void preloadLocalModels(true);
  };

  async function sendQuery(query: string, source: 'text' | 'voice' = 'text') {
    const trimmed = query.trim();
    if (!trimmed || isRequesting) return;
    if (!isOnline() && (mode === 'online')) {
      if (source === 'voice') {
        setVoiceError(locale.voiceOffline);
      }
      appendErrorMessage(
        trimmed,
        source === 'voice' ? locale.voiceOffline : locale.textOffline,
        'warning',
      );
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      message: { role: 'user', content: trimmed },
      status: 'success',
    };
    const assistantMessage: ChatMessage = {
      id: Date.now() + 1,
      message: { role: 'assistant', content: locale.waiting },
      status: 'loading',
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsRequesting(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const raw =
        mode === 'online'
          ? await textToQueryOnline(trimmed, {
              signal: controller.signal,
            })
          : await textToQueryLocal(trimmed);
      const result = buildQueryString(raw);
      setParams(result);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                status: 'success',
                message: {
                  role: 'assistant',
                  content: locale.requestSucceeded,
                },
              }
            : message,
        ),
      );
    } catch (error) {
      const isAbort =
        error instanceof DOMException && error.name === 'AbortError';
      const errorText =
        error instanceof Error ? error.message : locale.requestFailed;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                status: 'error',
                severity: 'error',
                message: {
                  role: 'assistant',
                  content: isAbort ? locale.requestAborted : errorText,
                },
              }
            : message,
        ),
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsRequesting(false);
    }
  }

  return (
    <Flex vertical gap="middle">
      <Modal
        open={isLocalModelModalOpen && mode === 'local'}
        title="Требуются локальные модели"
        okText="Ок"
        cancelButtonProps={{ style: { display: 'none' } }}
        closable={false}
        maskClosable={false}
        okButtonProps={{ loading: isLocalModelLoading }}
        onOk={handleLocalModelOk}
      >
        <Typography.Paragraph>
          Для работы приложения нужны локальные модели. Нажмите «Ок», чтобы
          загрузить их.
        </Typography.Paragraph>
        {localModelLoadError ? (
          <Typography.Text type="danger">
            Не удалось загрузить модели: {localModelLoadError}
          </Typography.Text>
        ) : null}
      </Modal>
      {/* Status and control area: display current status and provide action buttons */}
      <Flex vertical gap="middle">
        <div>
          {locale.currentStatus}{' '}
          {isRequesting
            ? locale.requesting
            : messages.length === 0
              ? locale.noMessages
              : locale.qaCompleted}
        </div>
        {isLocalModelLoading && localModelDownloadFile ? (
          <Typography.Text type="secondary">
            Загружается файл: {localModelDownloadFile}
          </Typography.Text>
        ) : null}
      </Flex>
      {/* Message list: display all chat messages, including default messages  */}
      <Bubble.List
        role={role}
        style={{ height: 'fit-content', width: '100%' }}
        items={messages.map(({ id, message, status, severity }) => {
          const isError = status === 'error';
          const content = isError ? (
            <Typography.Text type="danger">
              {severity === 'warning' ? (
                <WarningOutlined />
              ) : (
                <ExclamationCircleOutlined />
              )}{' '}
              {message.content}
            </Typography.Text>
          ) : (
            message.content
          );

          return {
            key: id,
            role: message.role,
            status: status,
            loading: status === 'loading',
            content,
          };
        })}
      />
      {/* Sender: user input area, supports sending messages and aborting requests */}
      <Sender
        loading={isRequesting}
        disabled={isLocalModelLoading}
        value={content}
        onCancel={() => {
          // Cancel current request
          abort();
        }}
        onChange={setContent}
        placeholder={locale.placeholder}
        footer={
          !isVoiceSupported ? (
            <Typography.Text type="secondary">
              {locale.voiceUnsupported}
            </Typography.Text>
          ) : voiceError ? (
            <Typography.Text type="danger">
              <WarningOutlined /> {voiceError}
            </Typography.Text>
          ) : isVoiceProcessing ? (
            <Typography.Text type="secondary">
              {locale.voiceProcessing}
            </Typography.Text>
          ) : spokenText ? (
            <Typography.Text type="secondary">{spokenText}</Typography.Text>
          ) : null
        }
        onSubmit={async (nextContent) => {
          setContent('');
          void sendQuery(nextContent, 'text');
        }}
        allowSpeech={
          isLocalModelLoading
            ? false
            : {
                recording: isRecording,
                onRecordingChange: handleRecordingChange,
              }
        }
      />
    </Flex>
  );
}
