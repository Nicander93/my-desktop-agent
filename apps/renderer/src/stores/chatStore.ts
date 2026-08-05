/**
 * 当前对话消息的内存态，经 IPC 落 SQLite。
 */
import { create } from "zustand";
import type {
  AgentTrace,
  ImageAttachment,
  MessagePart,
} from "@desktop-agent/shared";
import type { ToolCall } from "@/types/chat";
export type { ToolCall } from "@/types/chat";
import { syncToolCallsFromTrace } from "@/lib/toolCallSync";

/**
 * Renderer 中一个对话消息的可显示快照。
 *
 * 流式期间只更新内存，最终内容和扩展 metadata 通过 IPC 写入 SQLite；附件始终是 Host 管理的引用。
 */
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thinking?: string;
  thinkingDurationMs?: number;
  toolCalls?: ToolCall[];
  trace?: AgentTrace;
  parts?: MessagePart[];
  attachments?: ImageAttachment[];
}

/**
 * 当前对话的 Zustand 状态与持久化操作。
 *
 * Store 只拥有 renderer 缓存，不替代 Host 的消息真相来源；跨会话切换必须先加载相应持久化历史。
 */
interface ChatState {
  messages: Message[];
  isProcessing: boolean;
  currentConversationId: string | null;
  loadMessages: (conversationId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  persistMessage: (message: Message) => Promise<void>;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  persistMessageUpdate: (
    id: string,
    updates: {
      content?: string;
      toolCalls?: ToolCall[];
      thinking?: string;
      thinkingDurationMs?: number;
      trace?: AgentTrace;
      parts?: MessagePart[];
    },
  ) => Promise<void>;
  clearMessages: () => void;
  setProcessing: (processing: boolean) => void;
  setCurrentConversation: (conversationId: string | null) => void;
}

/**
 * 当前 Chat 对话的内存状态 Store。
 *
 * 流式 token 更新不触发数据库写入；`useAgent` 在结束时负责调用持久化操作，避免每个增量写盘。
 */
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  currentConversationId: null,

  /**
   * 通过 IPC 加载指定对话的历史，并恢复 trace 派生的工具调用显示状态。
   *
   * 只有请求成功时切换 currentConversationId，避免失败加载清空仍在显示的会话。
   */
  loadMessages: async (conversationId) => {
    try {
      const result =
        await window.electronAPI?.message.getByConversation(conversationId);
      if (result?.success && result.messages) {
        const messages = result.messages.map((m: any) => {
          const trace = m.metadata?.trace as AgentTrace | undefined;
          const toolCalls = (m.toolCalls || []) as ToolCall[];
          return {
            id: m.id,
            conversationId: m.conversationId,
            role: m.role,
            content: m.content,
            timestamp: m.createdAt,
            toolCalls: trace?.spans?.length
              ? syncToolCallsFromTrace(toolCalls, trace.spans)
              : toolCalls,
            thinking: m.metadata?.thinking as string | undefined,
            thinkingDurationMs: m.metadata?.thinkingDurationMs as
              | number
              | undefined,
            trace,
            parts: m.metadata?.parts as MessagePart[] | undefined,
            attachments: m.metadata?.attachments as
              | ImageAttachment[]
              | undefined,
          };
        });
        set({ messages, currentConversationId: conversationId });
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  },

  /**
   * 仅向内存追加消息，供用户消息和流式占位消息使用。
   */
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  /**
   * 将完整消息快照写入 Host SQLite。
   *
   * 所有 UI 扩展字段集中到 metadata，保持 shared IPC 契约的顶层消息字段稳定。
   */
  persistMessage: async (message) => {
    try {
      await window.electronAPI?.message.create(
        message.conversationId,
        message.role,
        message.content,
        message.toolCalls,
        {
          isStreaming: message.isStreaming,
          thinking: message.thinking,
          thinkingDurationMs: message.thinkingDurationMs,
          trace: message.trace,
          parts: message.parts,
          attachments: message.attachments,
        },
        message.id,
      );
    } catch (error) {
      console.error("Failed to persist message:", error);
    }
  },

  /**
   * 局部更新内存消息，不产生持久化副作用。
   *
   * 主要服务于流式 token、trace 和工具事件；结束时必须由调用方写入最终快照。
   */
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),

  /**
   * 持久化流式 assistant 消息的最终更新。
   *
   * 未提供的 metadata 字段从当前内存消息继承，避免只更新文本时意外丢失 trace 或 thinking。
   */
  persistMessageUpdate: async (id, updates) => {
    try {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.content !== undefined) dbUpdates.content = updates.content;
      if (updates.toolCalls !== undefined)
        dbUpdates.toolCalls = updates.toolCalls;
      if (
        updates.thinking !== undefined ||
        updates.thinkingDurationMs !== undefined ||
        updates.trace !== undefined ||
        updates.parts !== undefined
      ) {
        const msg = get().messages.find((m) => m.id === id);
        dbUpdates.metadata = {
          thinking: updates.thinking ?? msg?.thinking,
          thinkingDurationMs:
            updates.thinkingDurationMs ?? msg?.thinkingDurationMs,
          trace: updates.trace ?? msg?.trace,
          parts: updates.parts ?? msg?.parts,
        };
      }
      await window.electronAPI?.message.update(id, dbUpdates);
    } catch (error) {
      console.error("Failed to persist message update:", error);
    }
  },

  /**
   * 清空 renderer 当前消息缓存，不删除数据库历史。
   */
  clearMessages: () => set({ messages: [] }),
  /**
   * 标记当前 UI 是否有正在处理的 Agent 请求。
   */
  setProcessing: (processing) => set({ isProcessing: processing }),
  /**
   * 切换当前展示的对话标识，不自动加载消息。
   */
  setCurrentConversation: (conversationId) =>
    set({ currentConversationId: conversationId }),
}));
