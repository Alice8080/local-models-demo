import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { BubbleListProps } from '@ant-design/x';
import { Bubble, Sender } from '@ant-design/x';
import { Button, Flex, Typography } from 'antd';
import React from 'react';
import { textToQueryParamsOnline } from '../utils/textToQueryOnline';

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

const useLocale = () => {
  return {
    abort: 'Отменить',
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
    retry: 'Повторить',
    currentStatus: 'Текущий статус:',
    newUserMessage: 'Новое сообщение пользователя',
    newAIResponse: 'Новый ответ модели',
    newSystemMessage: 'Новое системное сообщение',
    editMessage: 'Сообщение изменено',
    developerMessage: 'Вы — помощник, который отвечает на вопросы пользователя.',
    voiceUnsupported: 'Голосовой ввод не поддерживается браузером.',
    textOffline: 'Нет подключения к интернету. Текстовый запрос не отправлен.',
    voiceOffline: 'Нет подключения к интернету. Голосовой ввод недоступен.',
  };
};

type ChatMessage = {
  id: number;
  message: { role: 'assistant' | 'user' | 'system'; content: string };
  status: 'success' | 'loading' | 'error';
  severity?: 'error' | 'warning';
};

function filtersToText(params: string) {
  if (!params) return '';
  const operatorLabels: Record<string, string> = {
    eq: '==',
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
    ne: '!=',
  };
  const searchParams = new URLSearchParams(params);
  const parts: string[] = [];
  searchParams.forEach((value, key) => {
    const [field, operator] = key.split('_');
    if (!field || !operator) return;
    const label = operatorLabels[operator] ?? operator;
    parts.push(`${field} ${label} ${value}`);
  });
  if (!parts.length && !params.includes('=')) {
    return params;
  }
  return parts.join('\n');
}

// Message role configuration: define layout and rendering for assistant and user messages
const role: BubbleListProps['role'] = {
  assistant: {
    placement: 'start',
    contentRender(content: string | React.ReactNode) {
      if (typeof content !== 'string') return content;
      return filtersToText(content);
    },
  },
  user: {
    placement: 'end',
  },
};

export function OnlineChat({ setParams }: { setParams: (params: string) => void }) {
  const [content, setContent] = React.useState('');
  const locale = useLocale();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isRequesting, setIsRequesting] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = React.useState(true);
  const [spokenText, setSpokenText] = React.useState('');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);

  const isDefaultMessagesRequesting = false;

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setIsVoiceSupported(Boolean(SpeechRecognitionClass));
  }, []);

  const isOnline = () =>
    typeof navigator === 'undefined' ? true : navigator.onLine;

  const handleStartRecording = () => {
    if (typeof window === 'undefined') return;
    if (!isOnline()) {
      setVoiceError(locale.voiceOffline);
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
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setSpokenText(transcript);
      setVoiceError(null);
      void sendQuery(transcript, 'voice');
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
  };

  const handleStopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const chatMessages = messages;

  const handleRecordingChange = (recording: boolean) => {
    if (recording) {
      handleStartRecording();
    } else {
      handleStopRecording();
    }
  };

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

  const sendQuery = async (query: string, source: 'text' | 'voice' = 'text') => {
    const trimmed = query.trim();
    if (!trimmed || isRequesting) return;
    if (!isOnline()) {
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
      const result = await textToQueryParamsOnline(trimmed, {
        signal: controller.signal,
      });
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                status: 'success',
                message: {
                  role: 'assistant',
                  content: result || locale.requestFailed,
                },
              }
            : message,
        ),
      );
      setParams(result);
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      const errorText = error instanceof Error ? error.message : locale.requestFailed;
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
  };

  return (
    <Flex vertical gap="middle">
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
        <Flex align="center" gap="middle">
          {/* Abort button: only available when request is in progress */}
          <Button disabled={!isRequesting} onClick={abort}>
            {locale.abort}
          </Button>
        </Flex>
      </Flex>
      {/* Message list: display all chat messages, including default messages  */}
      <Bubble.List
        role={role}
        style={{ height: 'fit-content', width: '100%' }}
        items={chatMessages.map(({ id, message, status, severity }) => {
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
        disabled={isDefaultMessagesRequesting}
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
            <Typography.Text type="danger"><WarningOutlined />{' '}{voiceError}</Typography.Text>
          ) : spokenText ? (
            <Typography.Text type="secondary">{spokenText}</Typography.Text>
          ) : null
        }
        onSubmit={async (nextContent) => {
          setContent('');
          void sendQuery(nextContent, 'text');
        }}
        allowSpeech={{
          recording: isRecording,
          onRecordingChange: handleRecordingChange,
        }}
      />
    </Flex>
  );
};