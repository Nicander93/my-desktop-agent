import { create } from 'zustand';

export interface Message {
  id: string;
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
  output?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  status: 'pending' | 'running' | 'completed' | 'error';
}

interface ChatState {
  messages: Message[];
  isProcessing: boolean;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  setProcessing: (processing: boolean) => void;
  addToolCall: (messageId: string, toolCall: ToolCall) => void;
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isProcessing: false,
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
  })),
  clearMessages: () => set({ messages: [] }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  addToolCall: (messageId, toolCall) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === messageId 
        ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
        : m
    )
  })),
  updateToolCall: (messageId, toolCallId, updates) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === messageId
        ? {
            ...m,
            toolCalls: (m.toolCalls || []).map(tc => 
              tc.id === toolCallId ? { ...tc, ...updates } : tc
            )
          }
        : m
    )
  }))
}));