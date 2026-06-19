import { Session, Message, ToolCall, ToolResult } from '@desktop-agent/shared';

export interface AgentConfig {
  llm: {
    provider: 'openai' | 'anthropic' | 'openrouter';
    apiKey: string;
    model: string;
    baseURL?: string;
  };
  tools: string[];
  maxIterations: number;
  permissionMode: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan';
}

export interface AgentResponse {
  content: string;
  toolCalls: ToolCall[];
  artifacts: Artifact[];
}

export interface Artifact {
  id: string;
  type: string;
  name: string;
  path: string;
  content?: unknown;
}

export interface StreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  data: unknown;
}

export interface AgentCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}