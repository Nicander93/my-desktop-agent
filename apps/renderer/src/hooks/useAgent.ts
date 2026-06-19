import { useCallback, useEffect, useRef } from 'react';
import { useChatStore, Message } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { analyzeAgentMessages, extractStreamText } from '@/lib/agentMessage';

declare global {
  interface Window {
    electronAPI?: {
      agent: {
        createSession: (sessionId: string) => Promise<{ success: boolean; sessionId: string }>;
        sendMessage: (sessionId: string, content: string) => Promise<{ success: boolean; messages?: unknown[]; error?: string }>;
        prompt: (sessionId: string, content: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        getMessages: (sessionId: string) => Promise<{ success: boolean; messages?: unknown[] }>;
        closeSession: (sessionId: string) => Promise<{ success: boolean }>;
        onStreamMessage: (
          callback: (data: { sessionId: string; message: unknown }) => void
        ) => (() => void) | void;
      };
    };
  }
}

function createId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function useAgent() {
  const { addMessage, updateMessage, setProcessing } = useChatStore();
  const { currentSessionId, addSession, setCurrentSession } = useSessionStore();

  const activeSessionRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.agent) return;

    const handler = (data: { sessionId: string; message: unknown }) => {
      if (data.sessionId !== activeSessionRef.current) return;

      const messageId = streamingMessageIdRef.current;
      if (!messageId) return;

      const current = useChatStore.getState().messages.find((m) => m.id === messageId);
      const nextContent = extractStreamText(data.message, current?.content || '');
      if (nextContent !== null) {
        updateMessage(messageId, { content: nextContent, isStreaming: true });
      }
    };

    const unsubscribe = window.electronAPI.agent.onStreamMessage(handler);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [updateMessage]);

  const createSession = useCallback(async () => {
    const sessionId = createId();

    if (window.electronAPI?.agent) {
      const result = await window.electronAPI.agent.createSession(sessionId);
      if (!result.success) {
        throw new Error('创建会话失败');
      }
    }

    addSession({
      id: sessionId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    setCurrentSession(sessionId);
    return sessionId;
  }, [addSession, setCurrentSession]);

  const sendMessage = useCallback(async (content: string) => {
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = await createSession();
    }

    activeSessionRef.current = sessionId;

    addMessage({
      id: createId(),
      role: 'user',
      content,
      timestamp: Date.now()
    });

    const assistantId = createId();
    streamingMessageIdRef.current = assistantId;

    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolCalls: []
    });

    setProcessing(true);

    try {
      if (window.electronAPI?.agent) {
        const result = await window.electronAPI.agent.sendMessage(sessionId, content);

        if (!result.success) {
          updateMessage(assistantId, {
            content: `请求失败：${result.error || '未知错误'}`,
            isStreaming: false
          });
          return;
        }

        const current = useChatStore.getState().messages.find((m) => m.id === assistantId);
        const { text: assistantText, error: agentError } = result.messages
          ? analyzeAgentMessages(result.messages)
          : { text: '', error: undefined };

        if (current?.content) {
          updateMessage(assistantId, { isStreaming: false });
        } else if (assistantText) {
          updateMessage(assistantId, { content: assistantText, isStreaming: false });
        } else if (agentError) {
          updateMessage(assistantId, { content: agentError, isStreaming: false });
        } else {
          updateMessage(assistantId, {
            content: '模型未返回有效内容，请检查 API 配置或稍后重试。',
            isStreaming: false
          });
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        updateMessage(assistantId, {
          content: `收到你的消息：${content}\n\n这是模拟响应，后续会接入真实的 Agent Runtime。`,
          isStreaming: false
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      updateMessage(assistantId, {
        content: `发送消息失败：${error instanceof Error ? error.message : 'Unknown error'}`,
        isStreaming: false
      });
    } finally {
      streamingMessageIdRef.current = null;
      setProcessing(false);
    }
  }, [currentSessionId, createSession, addMessage, updateMessage, setProcessing]);

  const closeSession = useCallback(async () => {
    if (currentSessionId && window.electronAPI?.agent) {
      await window.electronAPI.agent.closeSession(currentSessionId);
    }
  }, [currentSessionId]);

  return {
    createSession,
    sendMessage,
    closeSession
  };
}
