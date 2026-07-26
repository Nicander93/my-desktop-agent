/**
 * Chat 发消息：校验工作区 → IPC → 订 agent:stream-message → 落库。
 * profile/MCP 组装在 electron agentHandlers。
 * activeSessionRef 用来丢掉切对话之后的迟到事件。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useChatStore, Message } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useUIStore } from '@/stores/uiStore';
import {
  analyzeAgentMessages,
  shouldShowThought,
} from '@/lib/agentMessage';
import { applyStreamEvent } from '@/lib/messageParts';
import { finalizeToolCalls, syncToolCallsFromTrace, applyTraceSpanToToolCalls } from '@/lib/toolCallSync';
import { parseMcpMentions, parseFileMentions, parseSkillMentions, appendTraceSpan, isTraceMessage, collectTraceFromMessages, mergeAgentTrace, traceRunToAgentTrace } from '@desktop-agent/shared';
import type { ImageAttachment } from '@desktop-agent/shared';

/** 前端临时 id，不是 DB 策略 */
function createId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/** thinking 和 content 一样时丢掉，避免重复显示 */
function normalizeAssistantFields(message: Message): Partial<Message> {
  const thinking = message.thinking?.trim();
  const content = message.content?.trim();

  if (!thinking) return {};

  if (content && thinking === content) {
    return { thinking: undefined, thinkingDurationMs: undefined };
  }

  return {};
}

/** 只留元数据，不带二进制 */
function snapshotAttachment(attachment: ImageAttachment): ImageAttachment {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    messageId: attachment.messageId ?? null,
    status: 'linked',
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    size: attachment.size,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    createdAt: attachment.createdAt,
  };
}

/** 合并流里的 trace；还空就 getLatestTraceRun。返回时 isLive=false */
async function resolveFinalTrace(
  sessionId: string,
  current: Message | undefined,
  resultMessages?: unknown[],
): Promise<Message['trace']> {
  let trace = mergeAgentTrace(
    current?.trace,
    resultMessages ? collectTraceFromMessages(resultMessages) : undefined,
  );

  if (!trace || trace.spans.length === 0) {
    const res = await window.electronAPI?.agent.getLatestTraceRun?.(sessionId);
    if (res?.success && res.traceRun) {
      trace = traceRunToAgentTrace(res.traceRun);
    }
  }

  if (!trace || trace.spans.length === 0) return undefined;
  return { ...trace, isLive: false };
}

/** 失败时把 live trace 关掉，免得面板一直转 */
function finalizeStreamingTrace(messageId: string): void {
  const current = useChatStore.getState().messages.find((m) => m.id === messageId);
  if (current?.trace?.isLive) {
    useChatStore.getState().updateMessage(messageId, {
      trace: { ...current.trace, isLive: false },
    });
  }
}

export function useAgent() {
  const { addMessage, updateMessage, persistMessage, setProcessing } = useChatStore();

  const saveAssistantMessage = async (
    assistantId: string,
    conversationId: string,
    content: string,
    toolCalls?: Message['toolCalls'],
    thinking?: string,
    thinkingDurationMs?: number,
    trace?: Message['trace'],
    parts?: Message['parts'],
  ) => {
    await persistMessage({
      id: assistantId,
      conversationId,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      toolCalls,
      thinking,
      thinkingDurationMs,
      trace,
      parts,
    });
  };

  /** 丢掉切对话后迟到的 stream */
  const activeSessionRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const thinkingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.agent) return;

    const handler = (data: { sessionId: string; message: unknown }) => {
      if (data.sessionId !== activeSessionRef.current) return;
      const messageId = streamingMessageIdRef.current;
      if (!messageId) return;

      const current = useChatStore.getState().messages.find((m) => m.id === messageId);
      if (!current) return;

      const updates: Partial<Message> = {};

      if (isTraceMessage(data.message)) {
        if (current.isStreaming) {
          const span = data.message.span;
          const currentTrace = current.trace ?? { runId: span.runId, spans: [], isLive: true };
          updates.trace = {
            runId: span.runId,
            spans: appendTraceSpan(currentTrace.spans, span),
            isLive: true,
          };
          if (span.type === 'tool_call' || span.type === 'tool_result') {
            const toolCalls = applyTraceSpanToToolCalls(current.toolCalls || [], span);
            updates.toolCalls = toolCalls;
            updates.isStreaming = true;
          }
          useUIStore.getState().openTracePanel();
        }
      } else {
        const partUpdate = applyStreamEvent(data.message, {
          parts: current.parts || [],
          toolCalls: current.toolCalls || [],
          isStreaming: current.isStreaming ?? false,
        });

        updates.parts = partUpdate.parts;
        updates.toolCalls = partUpdate.toolCalls;
        updates.content = partUpdate.content;
        updates.thinking = partUpdate.thinking || undefined;
        updates.isStreaming = partUpdate.isStreaming;

        if (updates.thinking && !thinkingStartedAtRef.current) {
          thinkingStartedAtRef.current = Date.now();
        }
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

  /** 占位 assistant → IPC → 收尾落库；没有 electronAPI 时走假回复 */
  const sendMessage = useCallback(async (content: string, attachments: ImageAttachment[] = []) => {
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
    thinkingStartedAtRef.current = null;

    const userMsg: Message = {
      id: createId(), conversationId: sessionId, role: 'user',
      content, timestamp: Date.now(),
      attachments: attachments.map(snapshotAttachment),
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
    useUIStore.getState().openTracePanel();

    const mcpMentions = parseMcpMentions(content);
    const fileRefs = parseFileMentions(content);
    const skillMentions = parseSkillMentions(content);

    try {
      if (window.electronAPI?.agent) {
        const result = await window.electronAPI.agent.sendMessage(sessionId, content, {
          mcpMentions,
          fileRefs,
          skillMentions,
          attachments: attachments.map((attachment) => ({ id: attachment.id, kind: 'image' as const })),
          messageId: userMsg.id,
        });

        streamingMessageIdRef.current = null;

        if (!result.success) {
          const errContent = `请求失败：${result.error || '未知错误'}`;
          finalizeStreamingTrace(assistantId);
          updateMessage(assistantId, { content: errContent, isStreaming: false });
          await saveAssistantMessage(assistantId, sessionId, errContent);
          return;
        }

        const current = useChatStore.getState().messages.find((m) => m.id === assistantId);
        const normalized = current ? normalizeAssistantFields(current) : {};
        const thinkingDurationMs = shouldShowThought({ ...current, ...normalized })
          && thinkingStartedAtRef.current
          ? Date.now() - thinkingStartedAtRef.current
          : undefined;

        const { text: assistantText, error: agentError } = result.messages
          ? analyzeAgentMessages(result.messages)
          : { text: '', error: undefined };

        const finalContent = normalized.content ?? current?.content;
        const finalThinking = normalized.thinking ?? current?.thinking;

        const finalTrace = await resolveFinalTrace(sessionId, current, result.messages);
        const syncedToolCalls = finalizeToolCalls(
          syncToolCallsFromTrace(current?.toolCalls ?? [], finalTrace?.spans ?? []),
        );

        if (finalContent) {
          updateMessage(assistantId, {
            ...normalized,
            isStreaming: false,
            thinkingDurationMs,
            trace: finalTrace,
            toolCalls: syncedToolCalls,
          });
          await saveAssistantMessage(
            assistantId,
            sessionId,
            finalContent,
            syncedToolCalls,
            finalThinking,
            thinkingDurationMs,
            finalTrace,
            current?.parts,
          );
        } else if (assistantText) {
          updateMessage(assistantId, {
            ...normalized,
            content: assistantText,
            isStreaming: false,
            thinkingDurationMs,
            trace: finalTrace,
            toolCalls: syncedToolCalls,
          });
          await saveAssistantMessage(
            assistantId,
            sessionId,
            assistantText,
            syncedToolCalls,
            finalThinking,
            thinkingDurationMs,
            finalTrace,
            current?.parts,
          );
        } else if (agentError) {
          updateMessage(assistantId, { ...normalized, content: agentError, isStreaming: false, thinkingDurationMs, trace: finalTrace, toolCalls: syncedToolCalls });
          await saveAssistantMessage(assistantId, sessionId, agentError, syncedToolCalls, finalThinking, thinkingDurationMs, finalTrace, current?.parts);
        } else {
          const emptyReply = '模型未返回有效内容，请检查 API 配置或稍后重试。';
          updateMessage(assistantId, { ...normalized, content: emptyReply, isStreaming: false, thinkingDurationMs, trace: finalTrace, toolCalls: syncedToolCalls });
          await saveAssistantMessage(assistantId, sessionId, emptyReply, syncedToolCalls, finalThinking, thinkingDurationMs, finalTrace, current?.parts);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const fallback = `收到你的消息：${content}\n\n这是模拟响应，后续会接入真实的 Agent Runtime。`;
        updateMessage(assistantId, { content: fallback, isStreaming: false });
        await saveAssistantMessage(assistantId, sessionId, fallback);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errMsg = `发送消息失败：${error instanceof Error ? error.message : 'Unknown error'}`;
      streamingMessageIdRef.current = null;
      finalizeStreamingTrace(assistantId);
      updateMessage(assistantId, { content: errMsg, isStreaming: false });
      await saveAssistantMessage(assistantId, sessionId, errMsg);
    } finally {
      streamingMessageIdRef.current = null;
      thinkingStartedAtRef.current = null;
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