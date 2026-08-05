/** Agent Runtime 与 UI 共用的基础消息、工具和产物结构。 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: unknown): Promise<ToolResult>;
}

/**
 * 工具执行向 Agent 与 UI 返回的成功数据或可展示错误。
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Runtime 内存会话及其消息、产物、工具调用和上下文快照。
 */
export interface Session {
  id: string;
  messages: RuntimeMessage[];
  artifacts: Artifact[];
  toolCalls: ToolCall[];
  files: string[];
  context: Record<string, unknown>;
}

/**
 * Runtime 使用的最小用户或助手文本消息。
 */
export interface RuntimeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/**
 * Agent 在工作区生成且可供 UI 定位的文件产物元数据。
 */
export interface Artifact {
  id: string;
  type: "markdown" | "code" | "docx" | "pptx" | "xlsx" | "image" | "json";
  name: string;
  path: string;
  createdAt: number;
}

/**
 * 一次工具调用的输入、可选输出与发生时间记录。
 */
export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  output?: ToolResult;
  timestamp: number;
}
