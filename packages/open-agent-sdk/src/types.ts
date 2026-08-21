/**
 * SDK 公共类型入口。
 *
 * 消息、权限、AgentOptions 定义在此；ToolDefinition 等模块类型从对应目录 re-export，
 * 调用方可以继续从本文件进口径。
 */

import type {
  ToolDefinition,
  ToolResultTransformer,
} from "./tools/types.js";

export type {
  ToolDefinition,
  ToolInputSchema,
  ToolContext,
  ToolUseContext,
  ToolResult,
  ToolResultTransformer,
  ValidationResult,
  PermissionResult,
} from "./tools/types.js";

// Content block types (provider-agnostic, compatible with Anthropic format)
/** Provider 无关的输入内容块，保持与 Anthropic 风格工具协议兼容。 */
export type ContentBlockParam =
  | { type: "text"; text: string }
  | { type: "image"; source: any }
  | { type: "tool_use"; id: string; name: string; input: any }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | any[];
      is_error?: boolean;
    };

/** SDK 内部已规范化的 assistant 内容块。 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "thinking"; thinking: string };

// --------------------------------------------------------------------------
// Message Types
// --------------------------------------------------------------------------

/** 会话中可由 SDK 持久化的对话角色。 */
export type MessageRole = "user" | "assistant";

/** 发送给模型或写入 transcript 的基础对话消息。 */
export interface ConversationMessage {
  role: MessageRole;
  content: string | ContentBlockParam[];
}

/** 带稳定 ID 与时间戳的用户会话消息。 */
export interface UserMessage {
  type: "user";
  message: ConversationMessage;
  uuid: string;
  timestamp: string;
}

/** 带用量与成本信息的 assistant 会话消息。 */
export interface AssistantMessage {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
  uuid: string;
  timestamp: string;
  usage?: TokenUsage;
  cost?: number;
}

/** 持久化会话中允许出现的消息联合。 */
export type Message = UserMessage | AssistantMessage;

// --------------------------------------------------------------------------
// SDK Message Types (streaming events)
// --------------------------------------------------------------------------

/** Agent 查询流向调用方发送的全部标准事件联合。 */
export type SDKMessage =
  | SDKAssistantMessage
  | SDKToolResultMessage
  | SDKResultMessage
  | SDKPartialMessage
  | SDKSystemMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKTaskNotificationMessage
  | SDKRateLimitEvent
  | SDKTraceMessage;

/** 流中产生的 assistant 内容事件。 */
export interface SDKAssistantMessage {
  type: "assistant";
  uuid?: string;
  session_id?: string;
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
  parent_tool_use_id?: string | null;
}

/** 工具完成后写入流的模型可见结果事件。 */
export interface SDKToolResultMessage {
  type: "tool_result";
  result: {
    tool_use_id: string;
    tool_name: string;
    output: string;
  };
}

/** 一次查询的终止事件，承载成功、失败、用量和最终文本。 */
export interface SDKResultMessage {
  type: "result";
  subtype:
    | "success"
    | "error_max_turns"
    | "error_during_execution"
    | "error_max_budget_usd"
    | string;
  uuid?: string;
  session_id?: string;
  is_error?: boolean;
  num_turns?: number;
  result?: string;
  stop_reason?: string | null;
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  usage?: TokenUsage;
  model_usage?: Record<string, { input_tokens: number; output_tokens: number }>;
  permission_denials?: Array<{ tool: string; reason: string }>;
  structured_output?: unknown;
  errors?: string[];
  /** @deprecated Use total_cost_usd */
  cost?: number;
}

/** token 级流式输出事件；字段随 partial 类型变化。 */
export interface SDKPartialMessage {
  type: "partial_message";
  partial: {
    type: "text" | "tool_use" | "thinking";
    text?: string;
    thinking?: string;
    name?: string;
    input?: string;
  };
}

/** Emitted once at session start with initialization info. */
export interface SDKSystemMessage {
  type: "system";
  subtype: "init";
  uuid?: string;
  session_id: string;
  tools: string[];
  model: string;
  cwd: string;
  mcp_servers: Array<{ name: string; status: string }>;
  permission_mode: string;
}

/** Marks a compaction boundary in the conversation. */
export interface SDKCompactBoundaryMessage {
  type: "system";
  subtype: "compact_boundary";
  summary?: string;
}

/** Status update during long operations. */
export interface SDKStatusMessage {
  type: "system";
  subtype: "status";
  message: string;
}

/** Task lifecycle notification. */
export interface SDKTaskNotificationMessage {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  status: string;
  message?: string;
}

/** Rate limit event. */
export interface SDKRateLimitEvent {
  type: "system";
  subtype: "rate_limit";
  retry_after_ms?: number;
  message: string;
}

/** Trace span emitted during agent loop (when trace is enabled). */
export interface SDKTraceMessage {
  type: "trace";
  span: import("./trace.js").TraceSpan;
}

// --------------------------------------------------------------------------
// Token Usage
// --------------------------------------------------------------------------

/** Provider 返回的输入、输出及缓存 token 用量。 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cached_input_tokens?: number;
}

// --------------------------------------------------------------------------
// Permission Types
// --------------------------------------------------------------------------

/** 工具授权的整体交互策略。 */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

/** 单次工具授权的最终裁决。 */
export type PermissionBehavior = "allow" | "deny";

/** 工具授权回调可返回的决定与可选输入改写。 */
export type CanUseToolResult = {
  behavior: PermissionBehavior;
  updatedInput?: unknown;
  message?: string;
};

/** 在工具执行前由宿主实现的异步授权钩子。 */
export type CanUseToolFn = (
  tool: ToolDefinition,
  input: unknown,
) => Promise<CanUseToolResult>;

// --------------------------------------------------------------------------
// MCP Types
// --------------------------------------------------------------------------

/** 支持的 MCP transport 配置联合。 */
export type McpServerConfig = McpStdioConfig | McpSseConfig | McpHttpConfig;

/** 以本地子进程运行的 MCP server 配置。 */
export interface McpStdioConfig {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** 使用 SSE transport 的远程 MCP server 配置。 */
export interface McpSseConfig {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
}

/** 使用 Streamable HTTP transport 的远程 MCP server 配置。 */
export interface McpHttpConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

// --------------------------------------------------------------------------
// Agent Types
// --------------------------------------------------------------------------

/** 供 task/subagent 工具引用的命名 Agent 配置。 */
export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: "sonnet" | "opus" | "haiku" | "inherit" | string;
  mcpServers?: Array<string | { name: string; tools?: string[] }>;
  skills?: string[];
  maxTurns?: number;
  criticalSystemReminder_EXPERIMENTAL?: string;
}

/** Provider 推理模式及可选 token 预算。 */
export interface ThinkingConfig {
  type: "adaptive" | "enabled" | "disabled";
  budgetTokens?: number;
}

// --------------------------------------------------------------------------
// Sandbox Types
// --------------------------------------------------------------------------

/** 运行工具时适用的 sandbox 总体设置。 */
export interface SandboxSettings {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  excludedCommands?: string[];
  allowUnsandboxedCommands?: boolean;
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
  ignoreViolations?: Record<string, string[]>;
  enableWeakerNestedSandbox?: boolean;
  ripgrep?: { command: string; args?: string[] };
}

/** sandbox 的网络放行规则。 */
export interface SandboxNetworkConfig {
  allowedDomains?: string[];
  allowManagedDomainsOnly?: boolean;
  allowLocalBinding?: boolean;
  allowUnixSockets?: string[];
  allowAllUnixSockets?: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
}

/** sandbox 的文件读写限制。 */
export interface SandboxFilesystemConfig {
  allowWrite?: string[];
  denyWrite?: string[];
  denyRead?: string[];
}

// --------------------------------------------------------------------------
// Output Format
// --------------------------------------------------------------------------

/** 要求 Provider 返回结构化 JSON 的输出格式。 */
export interface OutputFormat {
  type: "json_schema";
  schema: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// Setting Sources
// --------------------------------------------------------------------------

/** 设置可加载的来源优先级类别。 */
export type SettingSource = "user" | "project" | "local";

// --------------------------------------------------------------------------
// Model Info
// --------------------------------------------------------------------------

/** 可在 UI 或配置中选择的模型能力描述。 */
export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ("low" | "medium" | "high" | "max")[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
}

/**
 * 创建或查询 Agent 时的跨 Provider 配置。
 *
 * 该对象是宿主与 SDK 的主要边界；会话、授权、工具、流式和 trace 选项必须在此处保持可序列化语义。
 */
export interface AgentOptions {
  /** LLM model ID */
  model?: string;
  /**
   * API type: 'anthropic-messages' or 'openai-completions'.
   * Falls back to CODEANY_API_TYPE env var. Default: 'anthropic-messages'.
   */
  apiType?: import("./providers/types.js").ApiType;
  /** API key. Falls back to CODEANY_API_KEY env var. */
  apiKey?: string;
  /** API base URL override */
  baseURL?: string;
  /** Working directory for file/shell tools */
  cwd?: string;
  /** System prompt override or preset */
  systemPrompt?:
    | string
    | { type: "preset"; preset: "default"; append?: string };
  /** Append to default system prompt */
  appendSystemPrompt?: string;
  /** Include best-effort host environment details in the runtime context. */
  includeEnvironmentContext?: boolean;
  /** Provider prompt caching hints. */
  promptCache?: import("./providers/types.js").PromptCacheConfig;
  /** Available tools (ToolDefinition[] or string[] preset) */
  tools?: ToolDefinition[] | string[] | { type: "preset"; preset: "default" };
  /** Maximum number of agentic turns per query */
  maxTurns?: number;
  /** Maximum USD budget per query */
  maxBudgetUsd?: number;
  /** Extended thinking configuration */
  thinking?: ThinkingConfig;
  /** Maximum thinking tokens (deprecated, use thinking.budgetTokens) */
  maxThinkingTokens?: number;
  /** Structured output JSON schema */
  jsonSchema?: Record<string, unknown>;
  /** Structured output format */
  outputFormat?: OutputFormat;
  /** Permission handler callback */
  canUseTool?: CanUseToolFn;
  /** Permission mode controlling tool approval behavior */
  permissionMode?: PermissionMode;
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Enable token-level streaming (yields partial_message events as tokens arrive) */
  stream?: boolean;
  /** Environment variables */
  env?: Record<string, string | undefined>;
  /** Per-session subprocess env (Bash/MCP), merged over process.env at spawn time */
  subprocessEnv?: Record<string, string>;
  /** Transforms model-visible tool output; Trace always receives the raw result first. */
  toolResultTransformer?: ToolResultTransformer;
  /** Optional generic metadata persisted with the trace run start span. */
  traceMetadata?: Record<string, unknown>;
  /** Stop repeated identical failed tool calls after this many attempts. */
  maxSameToolRetries?: number;
  /** Per-request API retry policy (rate limits, 5xx, network blips). */
  apiRetry?: import("./utils/retry.js").RetryConfig;
  /** Tool names to pre-approve without prompting */
  allowedTools?: string[];
  /** Tool names to deny */
  disallowedTools?: string[];
  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig | any>; // supports McpSdkServerConfig
  /** Custom subagent definitions */
  agents?: Record<string, AgentDefinition>;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Effort level for reasoning */
  effort?: "low" | "medium" | "high" | "max";
  /** Fallback model if primary is unavailable */
  fallbackModel?: string;
  /** Continue the most recent session in cwd */
  continue?: boolean;
  /** Resume a specific session by ID */
  resume?: string;
  /** Fork a session instead of continuing it */
  forkSession?: boolean;
  /** Persist session to disk */
  persistSession?: boolean;
  /** Explicit session ID */
  sessionId?: string;
  /** Enable file checkpointing (for rewindFiles) */
  enableFileCheckpointing?: boolean;
  /** Sandbox configuration */
  sandbox?: SandboxSettings;
  /** Load settings from filesystem */
  settingSources?: SettingSource[];
  /** Plugin configurations */
  plugins?: Array<{ name: string; config?: Record<string, unknown> }>;
  /** Additional working directories */
  additionalDirectories?: string[];
  /** Default agent to use */
  agent?: string;
  /** Debug mode */
  debug?: boolean;
  /** Debug log file */
  debugFile?: string;
  /** Tool-specific configuration */
  toolConfig?: Record<string, unknown>;
  /** Enable prompt suggestions */
  promptSuggestions?: boolean;
  /** Strict MCP config validation */
  strictMcpConfig?: boolean;
  /** Extra CLI arguments */
  extraArgs?: Record<string, string | null>;
  /** SDK betas to enable */
  betas?: string[];
  /** Permission prompt tool name override */
  permissionPromptToolName?: string;
  /** Hook configurations */
  hooks?: Record<
    string,
    Array<{
      matcher?: string;
      hooks: Array<
        (
          input: any,
          toolUseId: string,
          context: { signal: AbortSignal },
        ) => Promise<any>
      >;
      timeout?: number;
    }>
  >;
  /**
   * Enable agent loop tracing for observability.
   * Records LLM requests/responses and tool calls; persists to trace.jsonl when session is saved.
   */
  trace?: boolean | import("./trace.js").TraceConfig;
}

/** 非流式查询最终返回的文本、用量、耗时与会话快照。 */
export interface QueryResult {
  /** Final text output from the assistant */
  text: string;
  /** Token usage */
  usage: TokenUsage;
  /** Number of agentic turns */
  num_turns: number;
  /** Duration in milliseconds */
  duration_ms: number;
  /** All conversation messages */
  messages: Message[];
}

// --------------------------------------------------------------------------
// Query Engine Types
// --------------------------------------------------------------------------

/** 已由入口归一化、供 QueryEngine 执行的必填运行配置。 */
export interface QueryEngineConfig {
  cwd: string;
  model: string;
  /** LLM provider instance (created from apiType) */
  provider: import("./providers/types.js").LLMProvider;
  tools: ToolDefinition[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
  includeEnvironmentContext?: boolean;
  promptCache?: import("./providers/types.js").PromptCacheConfig;
  maxTurns: number;
  maxBudgetUsd?: number;
  maxTokens: number;
  thinking?: ThinkingConfig;
  jsonSchema?: Record<string, unknown>;
  canUseTool: CanUseToolFn;
  /** Enable token-level streaming */
  stream: boolean;
  abortSignal?: AbortSignal;
  agents?: Record<string, AgentDefinition>;
  /** Hook registry for lifecycle events */
  hookRegistry?: import("./hooks.js").HookRegistry;
  /** Session ID for hook context */
  sessionId?: string;
  /** Trace recorder for observability (opt-in) */
  traceRecorder?: import("./trace.js").TraceRecorder;
  /** Per-session subprocess env passed to tools */
  subprocessEnv?: Record<string, string>;
  toolResultTransformer?: ToolResultTransformer;
  traceMetadata?: Record<string, unknown>;
  maxSameToolRetries?: number;
  apiRetry?: import("./utils/retry.js").RetryConfig;
}
