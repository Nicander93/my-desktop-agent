/**
 * Provider 抽象层的统一协议。
 *
 * SDK 内部始终使用 Anthropic 风格的标准消息；各 Provider 负责与原生 API 互转，Engine 不应依赖具体供应商字段。
 */

/**
 * 当前支持的 Provider 原生 API 协议。
 *
 * 该值描述传输格式而非模型名称，模型选择和端点配置由上层 AgentOptions 管理。
 */
export type ApiType = "anthropic-messages" | "openai-completions";

/**
 * 发给 Provider 的标准化单轮请求。
 *
 * `system` 与 `messages` 已由 Engine 组装；Provider 只能转换格式，不能插入 Desktop 级策略或上下文。
 */
export interface CreateMessageParams {
  model: string;
  maxTokens: number;
  system: string;
  messages: NormalizedMessageParam[];
  tools?: NormalizedTool[];
  thinking?: { type: string; budget_tokens?: number };
  promptCache?: PromptCacheConfig;
}

/**
 * Provider 可选的 Prompt Cache 配置。
 *
 * 供应商不支持时 Provider 必须忽略非标准字段，而非拒绝整个请求。
 */
export interface PromptCacheConfig {
  enabled?: boolean;
  key?: string;
  retention?: "in_memory" | "24h";
  ttl?: "5m" | "1h";
}

/**
 * SDK 内部统一的历史消息格式（Anthropic 风格）。
 *
 * tool result 仍以 user 消息内容块表示，转换为 OpenAI 独立 tool 消息的责任属于 Provider。
 */
export interface NormalizedMessageParam {
  role: "user" | "assistant";
  content: string | NormalizedContentBlock[];
}

/**
 * 标准化历史消息的内容块。
 *
 * `input` 与 `source` 保留为供应商无关的宽松结构，执行前的 schema 校验与权限检查不在此类型层完成。
 */
export type NormalizedContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }
  | { type: "image"; source: any }
  | { type: "thinking"; thinking: string };

/**
 * Provider 无关的工具描述。
 *
 * 只传输模型需要的名称、描述与 JSON schema；工具实现与副作用保留在 Engine 工具注册表。
 */
export interface NormalizedTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Provider 返回给 Engine 的标准化完整响应。
 *
 * `stopReason` 允许保留未识别的供应商状态，避免适配器静默丢失诊断信息。
 */
export interface CreateMessageResponse {
  content: NormalizedResponseBlock[];
  stopReason: "end_turn" | "max_tokens" | "tool_use" | string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cached_input_tokens?: number;
  };
}

/**
 * 标准化 assistant 响应内容。
 *
 * 工具调用参数在 Engine 执行前仍可能经历权限回调的受控修改。
 */
export type NormalizedResponseBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: any };

/**
 * 流式文本增量，按到达顺序追加到当前 assistant 文本。
 */
export interface StreamingTextDelta {
  type: "text_delta";
  text: string;
}

/**
 * 流式推理内容增量。
 *
 * UI 可选择展示或隐藏，但 Provider 必须与最终响应一致地累计它。
 */
export interface StreamingThinkingDelta {
  type: "thinking_delta";
  thinking: string;
}

/**
 * 工具调用开始事件，提供稳定 ID 与名称。
 */
export interface StreamingToolUseStart {
  type: "tool_use_start";
  id: string;
  name: string;
}

/**
 * 工具调用 JSON 参数的增量片段。
 *
 * 片段本身不保证可解析，只有最终 `message_stop` 的内容可直接执行。
 */
export interface StreamingToolUseInputDelta {
  type: "tool_use_input_delta";
  id: string;
  input_json_delta: string;
}

/**
 * 流结束事件，携带完整标准化响应和用量。
 *
 * Engine 依赖它写入消息历史；Provider 必须在连接正常结束时产出此事件。
 */
export interface StreamingMessageStop {
  type: "message_stop";
  stopReason: CreateMessageResponse["stopReason"];
  usage: CreateMessageResponse["usage"];
  /**
   * 已累计完成的完整响应内容块。
   */
  content: NormalizedResponseBlock[];
}

/**
 * Provider 流式实现可产生的所有标准化增量事件联合。
 */
export type StreamingChunk =
  | StreamingTextDelta
  | StreamingThinkingDelta
  | StreamingToolUseStart
  | StreamingToolUseInputDelta
  | StreamingMessageStop;

/**
 * Engine 依赖的 LLM Provider 接口。
 *
 * 实现负责协议转换和错误状态保留；重试、工具循环、权限及 Session 生命周期由 Engine 负责。
 */
export interface LLMProvider {
  /**
   * 此实现对应的原生 API 协议。
   */
  readonly apiType: ApiType;

  /**
   * 发送一轮非流式请求并返回标准化响应。
   */
  createMessage(params: CreateMessageParams): Promise<CreateMessageResponse>;

  /**
   * 发送一轮流式请求并产出统一增量事件。
   *
   * 未实现时 Engine 回退至 `createMessage`；实现者必须在正常结束时产生 `message_stop`。
   */
  createStreamingMessage?(
    params: CreateMessageParams,
  ): AsyncIterable<StreamingChunk>;
}
