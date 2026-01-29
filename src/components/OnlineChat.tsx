import type { BubbleListProps } from '@ant-design/x';
import { Bubble, Sender } from '@ant-design/x';
import { Button, Divider, Flex } from 'antd';
import React from 'react';
import { textToQueryParamsOnline } from '../utils/textToQueryOnline';

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
  };
};

type ChatMessage = {
  id: number;
  message: { role: 'assistant' | 'user' | 'system'; content: string };
  status: 'success' | 'loading' | 'error';
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
  return parts.join('\n');
}

// Message role configuration: define layout and rendering for assistant and user messages
const role: BubbleListProps['role'] = {
  assistant: {
    placement: 'start',
    contentRender(content: string) {
      // Double '\n' in a mark will causes markdown parse as a new paragraph, so we need to replace it with a single '\n'
      // const newContent = content.replace(/\n\n/g, '<br/><br/>');
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

  const isDefaultMessagesRequesting = false;

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const chatMessages = messages;

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
        items={chatMessages.map(({ id, message, status }) => ({
          key: id,
          role: message.role,
          status: status,
          loading: status === 'loading',
          content: message.content,
        }))}
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
        onSubmit={async (nextContent) => {
          const trimmed = nextContent.trim();
          if (!trimmed || isRequesting) return;

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
          setContent('');
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
        }}
      />
    </Flex>
  );
};