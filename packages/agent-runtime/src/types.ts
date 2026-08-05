/**
 * agent-runtime 对外类型；实际 Agent 实现在 runtime.ts 与 open-agent-sdk。
 * 部分字段为历史 IPC 形状，新逻辑优先用 shared 类型。
 */
import { Session, Message, ToolCall, ToolResult } from "@desktop-agent/shared";

/**
 * 旧 IPC 兼容的 Agent 初始化配置，包含模型连接、可用工具与权限模式。
 */
export interface AgentConfig {
  llm: {
    provider: "openai" | "anthropic" | "openrouter";
    apiKey: string;
    model: string;
    baseURL?: string;
  };
  tools: string[];
  maxIterations: number;
  permissionMode:
    | "default"
    | "acceptEdits"
    | "dontAsk"
    | "bypassPermissions"
    | "plan";
}

/**
 * 一轮 Agent 执行完成后聚合的文本、工具调用和产物。
 */
export interface AgentResponse {
  content: string;
  toolCalls: ToolCall[];
  artifacts: Artifact[];
}

/**
 * Agent 产出的可定位文件或内存内容描述。
 */
export interface Artifact {
  id: string;
  type: string;
  name: string;
  path: string;
  content?: unknown;
}

/**
 * 运行时向上游推送的标准流式事件信封。
 */
export interface StreamEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  data: unknown;
}

/**
 * 消费 Agent 流式生命周期的可选回调集合。
 */
export interface AgentCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}
