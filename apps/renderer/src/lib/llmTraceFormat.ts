/**
 * Trace 面板：LLM 请求/响应与工具 span 的摘要与格式化
 */
import type {
  LlmRequestPayload,
  LlmResponsePayload,
  ToolCallPayload,
  ToolResultPayload,
  TraceSpan,
} from "@desktop-agent/shared";

/** Trace 面板默认预览上限，完整正文仍保留给展开视图。 */
const PREVIEW_LEN = 300;

/** 供 trace UI 统一渲染的消息文本与预览状态。 */
export interface NormalizedTraceMessage {
  role: string;
  text: string;
  preview: string;
  isLong: boolean;
}

/** 从多种 Provider 内容块中提取人可读文本，未知结构退回 JSON 以保留诊断信息。 */
export function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    if (content != null && typeof content === "object") {
      const obj = content as Record<string, unknown>;
      if (typeof obj.text === "string") return obj.text;
      if (typeof obj.content === "string") return obj.content;
    }
    return content != null ? JSON.stringify(content, null, 2) : "";
  }

  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text);
      } else if (b.type === "tool_use") {
        const name = typeof b.name === "string" ? b.name : "tool";
        parts.push(`[tool_use: ${name}]`);
      } else if (b.type === "tool_result") {
        const text =
          typeof b.content === "string"
            ? b.content
            : extractMessageText(b.content);
        parts.push(`[tool_result]\n${text}`);
      } else if (typeof b.text === "string") {
        parts.push(b.text);
      } else {
        parts.push(JSON.stringify(block, null, 2));
      }
    }
  }
  return parts.join("\n");
}

/** 生成无省略号的截断预览，并单独返回是否可展开的标志。 */
export function makePreview(
  text: string,
  maxLen = PREVIEW_LEN,
): { preview: string; isLong: boolean } {
  if (text.length <= maxLen) return { preview: text, isLong: false };
  return { preview: text.slice(0, maxLen), isLong: true };
}

/** 将不可信 trace payload 归一化为 UI 可安全展示的消息结构。 */
export function normalizeTraceMessage(msg: unknown): NormalizedTraceMessage {
  if (!msg || typeof msg !== "object") {
    const text = msg != null ? String(msg) : "";
    const { preview, isLong } = makePreview(text);
    return { role: "unknown", text, preview, isLong };
  }

  const m = msg as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const text = extractMessageText(m.content ?? m);
  const { preview, isLong } = makePreview(text);
  return { role, text, preview, isLong };
}

/** 提取 LLM 请求摘要，避免在列表中渲染完整 system prompt 和消息正文。 */
export function summarizeLlmRequest(payload: LlmRequestPayload) {
  return {
    systemLen: payload.system?.length ?? 0,
    messageCount: payload.messages?.length ?? 0,
    toolCount: payload.tools?.length ?? 0,
    estimatedTokens: payload.estimatedInputTokens,
    maxTokens: payload.maxTokens,
    thinking: payload.thinking,
  };
}

/** 提取 LLM 响应的终止原因、用量和内容块类型，供诊断列表展示。 */
export function summarizeLlmResponse(payload: LlmResponsePayload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const blockTypes = content.map((block) => {
    if (block && typeof block === "object" && "type" in block) {
      return String((block as { type: unknown }).type);
    }
    return typeof block;
  });

  return {
    stopReason: payload.stopReason,
    inputTokens: payload.usage?.input_tokens,
    outputTokens: payload.usage?.output_tokens,
    blockTypes,
    blockCount: content.length,
  };
}

/** 从工具 span 负载提取轻量摘要，不展开可能很大的输入或输出。 */
export function summarizeToolPayload(
  payload: unknown,
  type: TraceSpan["type"],
): {
  name?: string;
  inputKeyCount?: number;
  outputLen?: number;
  isError?: boolean;
  truncated?: boolean;
} {
  if (!payload || typeof payload !== "object") return {};

  if (type === "tool_call") {
    const p = payload as ToolCallPayload;
    const input = p.input;
    const inputKeyCount =
      input && typeof input === "object" && !Array.isArray(input)
        ? Object.keys(input as object).length
        : 0;
    return { name: p.name, inputKeyCount };
  }

  if (type === "tool_result") {
    const p = payload as ToolResultPayload;
    return {
      name: p.name,
      outputLen: p.output?.length ?? 0,
      isError: p.isError,
      truncated: p.truncated,
    };
  }

  return {};
}

/** 判断工具输入是否适合内联键值展示，复杂结构必须使用展开 JSON 视图。 */
export function isSimpleToolInput(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 5) return false;
  return entries.every(([, v]) => {
    const t = typeof v;
    return t === "string" || t === "number" || t === "boolean" || v == null;
  });
}

/** 格式化简单工具输入值；对象保持 JSON 以避免丢失结构。 */
export function formatToolInputValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

/** 兼容 SDK 与 OpenAI function 格式，提取工具名称用于请求摘要。 */
export function extractToolNames(tools: unknown[] | undefined): string[] {
  if (!tools?.length) return [];
  return tools.map((tool) => {
    if (tool && typeof tool === "object") {
      const t = tool as Record<string, unknown>;
      if (typeof t.name === "string") return t.name;
      const fn = t.function as Record<string, unknown> | undefined;
      if (fn && typeof fn.name === "string") return fn.name;
    }
    return "unknown";
  });
}

/** 解析后的内容块信息，保留原始块供未知类型的诊断展开。 */
export interface ContentBlockInfo {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  raw?: unknown;
}

/** 将内容块归一化为 trace UI 的显示模型，不识别的块仍保留可读回退文本。 */
export function parseContentBlocks(content: unknown[]): ContentBlockInfo[] {
  return content.map((block) => {
    if (typeof block === "string") {
      return { type: "text", text: block };
    }
    if (!block || typeof block !== "object") {
      return { type: "unknown", raw: block };
    }
    const b = block as Record<string, unknown>;
    const type = typeof b.type === "string" ? b.type : "unknown";

    if (type === "text" && typeof b.text === "string") {
      return { type, text: b.text };
    }
    if (type === "tool_use") {
      return {
        type,
        name: typeof b.name === "string" ? b.name : undefined,
        input: b.input,
        raw: block,
      };
    }
    if (type === "thinking" && typeof b.thinking === "string") {
      return { type, text: b.thinking };
    }
    return { type, text: extractMessageText(block), raw: block };
  });
}
