/** 对话：归属某个工作区，id 同时作为 Agent sessionId */
export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  model: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 持久化消息，对应 SQLite messages 表 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: unknown[];
  metadata: Record<string, unknown>;
  createdAt: number;
}
