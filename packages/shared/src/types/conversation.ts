export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  model: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: unknown[];
  metadata: Record<string, unknown>;
  createdAt: number;
}
