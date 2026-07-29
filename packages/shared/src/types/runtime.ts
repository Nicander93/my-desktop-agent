/** Agent Runtime 与 UI 共用的基础消息、工具和产物结构。 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: unknown): Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Session {
  id: string;
  messages: RuntimeMessage[];
  artifacts: Artifact[];
  toolCalls: ToolCall[];
  files: string[];
  context: Record<string, unknown>;
}

export interface RuntimeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Artifact {
  id: string;
  type: 'markdown' | 'code' | 'docx' | 'pptx' | 'xlsx' | 'image' | 'json';
  name: string;
  path: string;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  output?: ToolResult;
  timestamp: number;
}
