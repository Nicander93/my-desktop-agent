/**
 * Chat 发消息：校验工作区 → IPC → 订 agent:stream-message → 落库。
 * profile/MCP 组装在 electron agentHandlers。
 * activeSessionRef 用来丢掉切对话之后的迟到事件。
 */
import { useCallback, useEffect, useRef } from "react";
import { useChatStore, Message } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useUIStore } from "@/stores/uiStore";
import { analyzeAgentMessages, shouldShowThought } from "@/lib/agentMessage";
import { applyStreamEvent } from "@/lib/messageParts";
import {
  finalizeToolCalls,
  syncToolCallsFromTrace,
  applyTraceSpanToToolCalls,
} from "@/lib/toolCallSync";
import {
  parseMcpMentions,
  parseFileMentions,
  parseSkillMentions,
  appendTraceSpan,
  isTraceMessage,
  collectTraceFromMessages,
  mergeAgentTrace,
  traceRunToAgentTrace,
} from "@desktop-agent/shared";
import type { ImageAttachment } from "@desktop-agent/shared";

/**
 * 生成仅用于当前 renderer 状态的临时消息 ID。
 *
 * 持久化主键由调用方传递；此函数不能作为跨进程或数据库 ID 策略使用。
 */
function createId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * 清除与最终文本完全相同的推理内容，避免 UI 重复展示。
 *
 * 仅规范化显示字段，不修改流式 parts 或 trace 中保留的原始事件。
 */
function normalizeAssistantFields(message: Message): Partial<Message> {
  const thinking = message.thinking?.trim();
  const content = message.content?.trim();

  if (!thinking) return {};

  if (content && thinking === content) {
    return { thinking: undefined, thinkingDurationMs: undefined };
  }

  return {};
}

/**
 * 为 user 消息持久化附件元数据快照，而不复制图片二进制。
 *
 * 二进制由 Host 附件服务按 ID 管理，renderer 不应将其放进 Zustand 消息状态。
 */
function snapshotAttachment(attachment: ImageAttachment): ImageAttachment {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    messageId: attachment.messageId ?? null,
    status: "linked",
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    size: attachment.size,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    createdAt: attachment.createdAt,
  };
}

/**
 * 合并流内 trace，并在事件缺失时回退读取最后持久化的 trace run。
 *
 * 返回的 trace 一律标记为非实时，避免收尾后 Trace 面板持续显示加载状态。
 */
async function resolveFinalTrace(
  sessionId: string,
  current: Message | undefined,
  resultMessages?: unknown[],
): Promise<Message["trace"]> {
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
  const current = useChatStore
    .getState()
    .messages.find((m) => m.id === messageId);
  if (current?.trace?.isLive) {
    useChatStore.getState().updateMessage(messageId, {
      trace: { ...current.trace, isLive: false },
    });
  }
}

/**
 * 编排 Chat 消息发送、Agent 流订阅、流式 UI 合并和最终持久化。
 *
 * Hook 只通过 `electronAPI` 调用 Host；切换会话后通过 ref 丢弃迟到事件，防止污染当前对话。
 */
export function useAgent() {
  const { addMessage, updateMessage, persistMessage, setProcessing } =
    useChatStore();

  /**
   * 将已经结束流式更新的 assistant 消息写入持久化层。
   *
   * 此处只在最终内容确定后调用，避免把每个 token 变化都写入数据库。
   */
  const saveAssistantMessage = async (
    assistantId: string,
    conversationId: string,
    content: string,
    toolCalls?: Message["toolCalls"],
    thinking?: string,
    thinkingDurationMs?: number,
    trace?: Message["trace"],
    parts?: Message["parts"],
  ) => {
    await persistMessage({
      id: assistantId,
      conversationId,
      role: "assistant",
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

    /**
     * 接收当前会话的 Agent 流事件，忽略切换会话后迟到的数据并合并到活动消息。
     */
    const handler = (data: { sessionId: string; message: unknown }) => {
      if (data.sessionId !== activeSessionRef.current) return;
      const messageId = streamingMessageIdRef.current;
      if (!messageId) return;

      const current = useChatStore
        .getState()
        .messages.find((m) => m.id === messageId);
      if (!current) return;

      const updates: Partial<Message> = {};

      if (isTraceMessage(data.message)) {
        if (current.isStreaming) {
          const span = data.message.span;
          const currentTrace = current.trace ?? {
            runId: span.runId,
            spans: [],
            isLive: true,
          };
          updates.trace = {
            runId: span.runId,
            spans: appendTraceSpan(currentTrace.spans, span),
            isLive: true,
          };
          if (span.type === "tool_call" || span.type === "tool_result") {
            const toolCalls = applyTraceSpanToToolCalls(
              current.toolCalls || [],
              span,
            );
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
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [updateMessage]);

  /**
   * 创建占位消息、发起 IPC、消费流式结果并在结束后持久化最终 assistant 消息。
   *
   * 没有 electronAPI 的浏览器预览环境使用模拟响应；真实运行时所有 Agent 行为必须经过 Host。
   */
  const sendMessage = useCallback(
    async (content: string, attachments: ImageAttachment[] = []) => {
      const workspaceId = useWorkspaceStore.getState().currentWorkspaceId;
      const sessionId = useSessionStore.getState().currentSessionId;

      if (!workspaceId) {
        addMessage({
          id: createId(),
          conversationId: "",
          role: "assistant",
          content: "请先选择或创建工作区",
          timestamp: Date.now(),
          isStreaming: false,
        });
        return;
      }

      if (!sessionId) {
        addMessage({
          id: createId(),
          conversationId: "",
          role: "assistant",
          content: "请先创建对话",
          timestamp: Date.now(),
          isStreaming: false,
        });
        return;
      }

      activeSessionRef.current = sessionId;
      thinkingStartedAtRef.current = null;

      const userMsg: Message = {
        id: createId(),
        conversationId: sessionId,
        role: "user",
        content,
        timestamp: Date.now(),
        attachments: attachments.map(snapshotAttachment),
      };
      addMessage(userMsg);
      persistMessage(userMsg);

      const assistantId = createId();
      streamingMessageIdRef.current = assistantId;

      const assistantMsg: Message = {
        id: assistantId,
        conversationId: sessionId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
        toolCalls: [],
      };
      addMessage(assistantMsg);

      setProcessing(true);
      useUIStore.getState().openTracePanel();

      const mcpMentions = parseMcpMentions(content);
      const fileRefs = parseFileMentions(content);
      const skillMentions = parseSkillMentions(content);

      try {
        if (window.electronAPI?.agent) {
          const result = await window.electronAPI.agent.sendMessage(
            sessionId,
            content,
            {
              mcpMentions,
              fileRefs,
              skillMentions,
              attachments: attachments.map((attachment) => ({
                id: attachment.id,
                kind: "image" as const,
              })),
              messageId: userMsg.id,
            },
          );

          streamingMessageIdRef.current = null;

          if (!result.success) {
            const errContent = `请求失败：${result.error || "未知错误"}`;
            finalizeStreamingTrace(assistantId);
            updateMessage(assistantId, {
              content: errContent,
              isStreaming: false,
            });
            await saveAssistantMessage(assistantId, sessionId, errContent);
            return;
          }

          const current = useChatStore
            .getState()
            .messages.find((m) => m.id === assistantId);
          const normalized = current ? normalizeAssistantFields(current) : {};
          const thinkingDurationMs =
            shouldShowThought({ ...current, ...normalized }) &&
            thinkingStartedAtRef.current
              ? Date.now() - thinkingStartedAtRef.current
              : undefined;

          const { text: assistantText, error: agentError } = result.messages
            ? analyzeAgentMessages(result.messages)
            : { text: "", error: undefined };

          const finalContent = normalized.content ?? current?.content;
          const finalThinking = normalized.thinking ?? current?.thinking;

          const finalTrace = await resolveFinalTrace(
            sessionId,
            current,
            result.messages,
          );
          const syncedToolCalls = finalizeToolCalls(
            syncToolCallsFromTrace(
              current?.toolCalls ?? [],
              finalTrace?.spans ?? [],
            ),
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
            updateMessage(assistantId, {
              ...normalized,
              content: agentError,
              isStreaming: false,
              thinkingDurationMs,
              trace: finalTrace,
              toolCalls: syncedToolCalls,
            });
            await saveAssistantMessage(
              assistantId,
              sessionId,
              agentError,
              syncedToolCalls,
              finalThinking,
              thinkingDurationMs,
              finalTrace,
              current?.parts,
            );
          } else if (finalThinking?.trim()) {
            // 推理模型可能只回 reasoning_content，避免误报成「API 配置错误」
            const thinkingOnly = finalThinking.trim();
            updateMessage(assistantId, {
              ...normalized,
              content: thinkingOnly,
              isStreaming: false,
              thinkingDurationMs,
              trace: finalTrace,
              toolCalls: syncedToolCalls,
            });
            await saveAssistantMessage(
              assistantId,
              sessionId,
              thinkingOnly,
              syncedToolCalls,
              finalThinking,
              thinkingDurationMs,
              finalTrace,
              current?.parts,
            );
          } else {
            const emptyReply =
              "模型未返回有效内容，请检查 API 配置或稍后重试。";
            updateMessage(assistantId, {
              ...normalized,
              content: emptyReply,
              isStreaming: false,
              thinkingDurationMs,
              trace: finalTrace,
              toolCalls: syncedToolCalls,
            });
            await saveAssistantMessage(
              assistantId,
              sessionId,
              emptyReply,
              syncedToolCalls,
              finalThinking,
              thinkingDurationMs,
              finalTrace,
              current?.parts,
            );
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const fallback = `收到你的消息：${content}\n\n这是模拟响应，后续会接入真实的 Agent Runtime。`;
          updateMessage(assistantId, { content: fallback, isStreaming: false });
          await saveAssistantMessage(assistantId, sessionId, fallback);
        }
      } catch (error) {
        console.error("Failed to send message:", error);
        const errMsg = `发送消息失败：${error instanceof Error ? error.message : "Unknown error"}`;
        streamingMessageIdRef.current = null;
        finalizeStreamingTrace(assistantId);
        updateMessage(assistantId, { content: errMsg, isStreaming: false });
        await saveAssistantMessage(assistantId, sessionId, errMsg);
      } finally {
        streamingMessageIdRef.current = null;
        thinkingStartedAtRef.current = null;
        setProcessing(false);
      }
    },
    [addMessage, updateMessage, persistMessage, setProcessing],
  );

  /**
   * 请求 Host 关闭当前会话的 Runtime Agent。
   *
   * 仅释放运行时资源，不删除持久化对话和消息记录。
   */
  const closeSession = useCallback(async () => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (sessionId && window.electronAPI?.agent) {
      await window.electronAPI.agent.closeSession(sessionId);
    }
  }, []);

  return { sendMessage, closeSession };
}
