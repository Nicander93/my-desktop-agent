/**
 * Agent 通信 Hook
 *
 * 桥接 chatStore 与主进程 AgentRuntime：
 * - 校验工作区和对话是否已选
 * - 发送消息并处理流式响应
 * - 同步持久化到 SQLite
 */
import { useCallback, useEffect, useRef } from 'react';
import { useChatStore, Message } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { analyzeAgentMessages, extractStreamText, parseStreamToolUpdate } from '@/lib/agentMessage';

function createId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function useAgent() {
  const { addMessage, updateMessage, persistMessage, setProcessing } = useChatStore();

  const saveAssistantMessage = async (
    conversationId: string,
    content: string,
    toolCalls?: Message['toolCalls'],
  ) => {
    await persistMessage({
      id: createId(),
      conversationId,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      toolCalls,
    });
  };

  /** 当前正在流式输出的 session，用于过滤 stream 事件 */
  const activeSessionRef = useRef<string | null>(null);
  /** 当前流式 assistant 消息的 id */
  const streamingMessageIdRef = useRef<string | null>(null);

  /** 订阅主进程 agent:stream-message，增量更新 assistant 内容 */
  useEffect(() => {
    if (!window.electronAPI?.agent) return;

    const handler = (data: { sessionId: string; message: unknown }) => {
      if (data.sessionId !== activeSessionRef.current) return;
      const messageId = streamingMessageIdRef.current;
      if (!messageId) return;

      const current = useChatStore.getState().messages.find((m) => m.id === messageId);
      if (!current) return;

      const nextContent = extractStreamText(data.message, current.content || '');
      const toolUpdate = parseStreamToolUpdate(data.message, current.toolCalls || []);
      const updates: Partial<Message> = {};

      if (nextContent !== null) {
        updates.content = nextContent;
      }

      if (toolUpdate) {
        updates.toolCalls = toolUpdate.toolCalls;
        updates.isStreaming = toolUpdate.isStreaming;
      } else if (nextContent !== null) {
        updates.isStreaming = true;
      }

      if (Object.keys(updates).length > 0) {
        updateMessage(messageId, updates);
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
          const errContent = `请求失败：${result.error || '未知错误'}`;
          updateMessage(assistantId, { content: errContent, isStreaming: false });
          await saveAssistantMessage(sessionId, errContent);
          return;
        }

        const current = useChatStore.getState().messages.find((m) => m.id === assistantId);
        const { text: assistantText, error: agentError } = result.messages
          ? analyzeAgentMessages(result.messages)
          : { text: '', error: undefined };

        // 优先用流式累积的内容，否则用最终解析结果
        if (current?.content) {
          updateMessage(assistantId, { isStreaming: false });
          await saveAssistantMessage(sessionId, current.content, current.toolCalls);
        } else if (assistantText) {
          updateMessage(assistantId, { content: assistantText, isStreaming: false });
          await saveAssistantMessage(sessionId, assistantText);
        } else if (agentError) {
          updateMessage(assistantId, { content: agentError, isStreaming: false });
          await saveAssistantMessage(sessionId, agentError);
        } else {
          const emptyReply = '模型未返回有效内容，请检查 API 配置或稍后重试。';
          updateMessage(assistantId, { content: emptyReply, isStreaming: false });
          await saveAssistantMessage(sessionId, emptyReply);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const fallback = `收到你的消息：${content}\n\n这是模拟响应，后续会接入真实的 Agent Runtime。`;
        updateMessage(assistantId, { content: fallback, isStreaming: false });
        await saveAssistantMessage(sessionId, fallback);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errMsg = `发送消息失败：${error instanceof Error ? error.message : 'Unknown error'}`;
      updateMessage(assistantId, { content: errMsg, isStreaming: false });
      await saveAssistantMessage(sessionId, errMsg);
    } finally {
      streamingMessageIdRef.current = null;
      setProcessing(false);
    }
  }, [addMessage, updateMessage, persistMessage, setProcessing]);

  const closeSession = useCallback(async () => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (sessionId && window.electronAPI?.agent) {
      await window.electronAPI.agent.closeSession(sessionId);
    }
  }, []);

  return { sendMessage, closeSession };
}
