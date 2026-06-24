import { useCallback, useEffect, useRef } from 'react';
import { useChatStore, Message } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
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
        onStreamMessage: (callback: (data: { sessionId: string; message: unknown }) => void) => (() => void) | void;
      };
      workspace: {
        create: (name: string, description?: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        createFromPath: (name: string, path: string, description?: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        getAll: () => Promise<{ success: boolean; workspaces?: any[]; error?: string }>;
        get: (id: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        update: (id: string, updates: any) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean }>;
        touch: (id: string) => Promise<{ success: boolean }>;
        getSettings: (workspaceId: string) => Promise<{ success: boolean; settings?: any }>;
        updateSettings: (workspaceId: string, settings: any) => Promise<{ success: boolean }>;
      };
      conversation: {
        create: (workspaceId: string, title?: string, model?: string) => Promise<{ success: boolean; conversation?: any; error?: string }>;
        getAll: (workspaceId: string, includeArchived?: boolean) => Promise<{ success: boolean; conversations?: any[]; error?: string }>;
        get: (id: string) => Promise<{ success: boolean; conversation?: any; error?: string }>;
        update: (id: string, updates: any) => Promise<{ success: boolean; conversation?: any; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean }>;
      };
      message: {
        create: (conversationId: string, role: string, content: string, toolCalls?: unknown[], metadata?: Record<string, unknown>) => Promise<{ success: boolean; message?: any }>;
        getByConversation: (conversationId: string, limit?: number, offset?: number) => Promise<{ success: boolean; messages?: any[] }>;
        update: (id: string, updates: any) => Promise<{ success: boolean; message?: any }>;
        deleteByConversation: (conversationId: string) => Promise<{ success: boolean }>;
      };
      dialog: {
        selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
        confirmPathAccess: (options: { workspacePath: string; targetPath: string }) => Promise<{ success: boolean; response?: number; alwaysAllow?: boolean }>;
      };
    };
  }
}

function createId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function useAgent() {
  const { addMessage, updateMessage, persistMessage, persistMessageUpdate, setProcessing } = useChatStore();
  const { currentSessionId } = useSessionStore();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();

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

  const sendMessage = useCallback(async (content: string) => {
    const workspaceId = useWorkspaceStore.getState().currentWorkspaceId;
    const sessionId = useSessionStore.getState().currentSessionId;

    if (!workspaceId) {
      addMessage({
        id: createId(), conversationId: '', role: 'assistant',
        content: '请先选择或创建工作区', timestamp: Date.now(), isStreaming: false
      });
      return;
    }

    if (!sessionId) {
      addMessage({
        id: createId(), conversationId: '', role: 'assistant',
        content: '请先创建对话', timestamp: Date.now(), isStreaming: false
      });
      return;
    }

    activeSessionRef.current = sessionId;

    const userMsg: Message = {
      id: createId(), conversationId: sessionId, role: 'user',
      content, timestamp: Date.now()
    };
    addMessage(userMsg);
    persistMessage(userMsg);

    const assistantId = createId();
    streamingMessageIdRef.current = assistantId;

    const assistantMsg: Message = {
      id: assistantId, conversationId: sessionId, role: 'assistant',
      content: '', timestamp: Date.now(), isStreaming: true, toolCalls: []
    };
    addMessage(assistantMsg);

    setProcessing(true);

    try {
      if (window.electronAPI?.agent) {
        const result = await window.electronAPI.agent.sendMessage(sessionId, content);

        if (!result.success) {
          updateMessage(assistantId, { content: `请求失败：${result.error || '未知错误'}`, isStreaming: false });
          return;
        }

        const current = useChatStore.getState().messages.find((m) => m.id === assistantId);
        const { text: assistantText, error: agentError } = result.messages
          ? analyzeAgentMessages(result.messages)
          : { text: '', error: undefined };

        if (current?.content) {
          updateMessage(assistantId, { isStreaming: false });
          persistMessageUpdate(assistantId, { content: current.content });
        } else if (assistantText) {
          updateMessage(assistantId, { content: assistantText, isStreaming: false });
          persistMessageUpdate(assistantId, { content: assistantText });
        } else if (agentError) {
          updateMessage(assistantId, { content: agentError, isStreaming: false });
          persistMessageUpdate(assistantId, { content: agentError });
        } else {
          updateMessage(assistantId, { content: '模型未返回有效内容，请检查 API 配置或稍后重试。', isStreaming: false });
          persistMessageUpdate(assistantId, { content: '模型未返回有效内容，请检查 API 配置或稍后重试。' });
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const fallback = `收到你的消息：${content}\n\n这是模拟响应，后续会接入真实的 Agent Runtime。`;
        updateMessage(assistantId, { content: fallback, isStreaming: false });
        persistMessageUpdate(assistantId, { content: fallback });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errMsg = `发送消息失败：${error instanceof Error ? error.message : 'Unknown error'}`;
      updateMessage(assistantId, { content: errMsg, isStreaming: false });
      persistMessageUpdate(assistantId, { content: errMsg });
    } finally {
      streamingMessageIdRef.current = null;
      setProcessing(false);
    }
  }, [addMessage, updateMessage, persistMessage, persistMessageUpdate, setProcessing]);

  const closeSession = useCallback(async () => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (sessionId && window.electronAPI?.agent) {
      await window.electronAPI.agent.closeSession(sessionId);
    }
  }, []);

  return { sendMessage, closeSession };
}
