import { create } from 'zustand';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  output?: { success: boolean; data?: unknown; error?: string };
  status: 'pending' | 'running' | 'completed' | 'error';
}

interface ChatState {
  messages: Message[];
  isProcessing: boolean;
  currentConversationId: string | null;
  loadMessages: (conversationId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  persistMessage: (message: Message) => Promise<void>;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  persistMessageUpdate: (id: string, updates: { content?: string; toolCalls?: ToolCall[] }) => Promise<void>;
  clearMessages: () => void;
  setProcessing: (processing: boolean) => void;
  setCurrentConversation: (conversationId: string | null) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  currentConversationId: null,

  loadMessages: async (conversationId) => {
    try {
      const result = await window.electronAPI?.message.getByConversation(conversationId);
      if (result?.success && result.messages) {
        const messages = result.messages.map((m: any) => ({
          id: m.id, conversationId: m.conversationId, role: m.role,
          content: m.content, timestamp: m.createdAt, toolCalls: m.toolCalls || []
        }));
        set({ messages, currentConversationId: conversationId });
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  },

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  persistMessage: async (message) => {
    try {
      await window.electronAPI?.message.create(
        message.conversationId, message.role, message.content,
        message.toolCalls, { isStreaming: message.isStreaming }
      );
    } catch (error) {
      console.error('Failed to persist message:', error);
    }
  },

  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
  })),

  persistMessageUpdate: async (id, updates) => {
    try {
      const dbUpdates: any = {};
      if (updates.content !== undefined) dbUpdates.content = updates.content;
      if (updates.toolCalls !== undefined) dbUpdates.toolCalls = updates.toolCalls;
      await window.electronAPI?.message.update(id, dbUpdates);
    } catch (error) {
      console.error('Failed to persist message update:', error);
    }
  },

  clearMessages: () => set({ messages: [] }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setCurrentConversation: (conversationId) => set({ currentConversationId: conversationId })
}));
