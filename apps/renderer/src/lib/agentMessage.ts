/**
 * Agent 流式消息解析：thinking/正文/工具调用的合并与去重
 */
import type { ToolCall } from "@/stores/chatStore";

/** 流式事件带来的工具调用列表与文本流阶段更新。 */
export interface StreamToolUpdate {
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

/** 流式事件带来的正文或思考字段增量/权威替换。 */
export interface StreamTextUpdate {
  content?: string;
  thinking?: string;
}

/** 追加 Provider 增量；thinking 合并可使用空行保持独立片段可读性。 */
function appendText(
  existing: string | undefined,
  chunk: string,
  multiline = false,
): string {
  if (!chunk) return existing || "";
  if (!existing) return chunk;
  return multiline ? `${existing}\n\n${chunk}` : existing + chunk;
}

/** 协调 partial thinking 与最终 assistant 块，识别重发、前缀扩展和真正新增内容。 */
export function reconcileStreamThinking(
  current: string | undefined,
  incoming: string,
): string {
  const cur = (current ?? "").trim();
  const next = incoming.trim();
  if (!next) return current ?? "";
  if (!cur) return incoming;
  if (next === cur) return current!;
  if (cur.includes(next) && next.length <= cur.length) return current!;
  if (next.startsWith(cur)) return incoming;
  return appendText(current, incoming, true);
}

/** 从 assistant 内容块分离 thinking 与正文；工具调用前的文本按模型协议归入思考轨迹。 */
export function parseAssistantSegments(
  content: unknown,
  hasToolHistory: boolean,
): { thinking: string; response: string } {
  if (typeof content === "string") {
    return { thinking: "", response: content };
  }

  if (!Array.isArray(content)) {
    return { thinking: "", response: "" };
  }

  const hasToolUse = content.some(
    (block) =>
      block != null &&
      typeof block === "object" &&
      (block as { type?: string }).type === "tool_use",
  );

  const thinkingParts: string[] = [];
  const responseParts: string[] = [];

  for (const block of content) {
    if (!block || typeof block !== "object") continue;

    if (
      (block as { type?: string }).type === "thinking" &&
      "thinking" in block
    ) {
      const t = (block as { thinking: string }).thinking;
      if (t) thinkingParts.push(t);
    } else if (
      (block as { type?: string }).type === "text" &&
      "text" in block
    ) {
      const text = (block as { text: string }).text;
      if (!text) continue;
      if (hasToolUse) {
        thinkingParts.push(text);
      } else if (hasToolHistory) {
        responseParts.push(text);
      } else {
        responseParts.push(text);
      }
    }
  }

  return {
    thinking: thinkingParts.join("\n\n"),
    response: responseParts.join("\n\n"),
  };
}

/** 根据活动工具判断当前消息应展示为工具思考还是正文响应阶段。 */
export function getStreamPhase(
  toolCalls: ToolCall[],
): "thinking" | "responding" {
  if (toolCalls.length === 0) return "responding";
  const hasActive = toolCalls.some(
    (t) => t.status === "running" || t.status === "pending",
  );
  if (hasActive) return "thinking";
  return "responding";
}

/** 仅在 thinking 非空且不等于正文时展示 Thought 区块，避免重复内容。 */
export function shouldShowThought(message: {
  thinking?: string;
  content?: string;
}): boolean {
  const thinking = message.thinking?.trim();
  if (!thinking) return false;
  const content = message.content?.trim();
  if (content && thinking === content) return false;
  return true;
}

/**
 * 从 SDK 流事件提取正文/思考更新。
 *
 * 活动工具期间忽略文本 partial，等待权威 assistant 块以避免工具参数附近的文本错位。
 */
export function extractStreamTextUpdate(
  message: unknown,
  current: { content: string; thinking?: string; toolCalls?: ToolCall[] },
): StreamTextUpdate | null {
  if (!message || typeof message !== "object") return null;

  const record = message as Record<string, unknown>;
  const toolCalls = current.toolCalls || [];

  if (record.type === "partial_message") {
    const partial = record.partial as
      | {
          type?: string;
          text?: string;
          thinking?: string;
        }
      | undefined;

    if (partial?.type === "thinking" && partial.thinking) {
      return { thinking: appendText(current.thinking, partial.thinking) };
    }

    if (partial?.type === "text" && partial.text) {
      const hasActiveTools = toolCalls.some(
        (t) => t.status === "running" || t.status === "pending",
      );
      if (hasActiveTools) return null;
      return { content: appendText(current.content, partial.text) };
    }
    return null;
  }

  if (record.type === "assistant") {
    const msg = record.message as { content?: unknown } | undefined;
    const { thinking, response } = parseAssistantSegments(
      msg?.content,
      toolCalls.length > 0,
    );
    const update: StreamTextUpdate = {};

    if (thinking) {
      update.thinking = reconcileStreamThinking(current.thinking, thinking);
    }
    if (response) {
      update.content = response;
    }

    return Object.keys(update).length > 0 ? update : null;
  }

  return null;
}

/** 从 string 或内容块数组提取 assistant 可见文本，未知结构安全忽略。 */
export function parseMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { text: string } =>
          block != null && typeof block === "object" && "text" in block,
      )
      .map((block) => block.text)
      .join("");
  }
  return "";
}

/** 兼容旧调用方的正文提取入口；新代码应使用包含 thinking 的更新对象。 */
export function extractStreamText(
  message: unknown,
  currentContent = "",
): string | null {
  const update = extractStreamTextUpdate(message, {
    content: currentContent,
    toolCalls: [],
  });
  if (!update?.content) return null;
  return update.content;
}

/** 常见 SDK result subtype 的用户可操作错误提示。 */
const RESULT_ERROR_HINT: Record<string, string> = {
  error: "API 请求失败，请检查模型名称、API Key 和 Base URL 是否正确",
  error_during_execution: "Agent 执行过程中出错",
  error_max_turns: "已达到最大对话轮数",
  error_max_budget_usd: "已达到费用上限",
};

/** 扫描完整 SDK 消息流，提取最后可见文本与最有用的失败信息。 */
export function analyzeAgentMessages(messages: unknown[]): {
  text: string;
  error?: string;
} {
  let text = "";
  let error: string | undefined;

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;

    const record = msg as Record<string, unknown>;

    if (record.type === "assistant") {
      const message = record.message as { content?: unknown } | undefined;
      const parsed = parseMessageContent(message?.content);
      if (parsed) text = parsed;
    }

    if (record.type === "result") {
      const subtype = typeof record.subtype === "string" ? record.subtype : "";
      const errors = Array.isArray(record.errors)
        ? record.errors.filter(
            (item): item is string => typeof item === "string",
          )
        : [];

      if (errors.length > 0) {
        error = errors.join("；");
      } else if (subtype === "error" || record.is_error === true) {
        error =
          RESULT_ERROR_HINT[subtype] || `请求失败（${subtype || "unknown"}）`;
      }

      if (typeof record.result === "string" && record.result) {
        text = record.result;
      }
    }
  }

  return { text, error };
}

/** 只提取 Agent 消息流的最终可见文本。 */
export function extractAssistantText(messages: unknown[]): string {
  return analyzeAgentMessages(messages).text;
}

/** 按工具 ID 合并流式更新，保留未在新事件中重复出现的字段。 */
function upsertToolCall(toolCalls: ToolCall[], entry: ToolCall): ToolCall[] {
  const idx = toolCalls.findIndex((t) => t.id === entry.id);
  if (idx >= 0) {
    const next = [...toolCalls];
    next[idx] = { ...next[idx], ...entry };
    return next;
  }
  return [...toolCalls, entry];
}

/**
 * 将 partial、assistant 和 tool_result 事件转换为工具调用状态。
 *
 * partial 使用临时 pending ID，权威 tool_use 到达后替换同名临时调用，避免 UI 重复项。
 */
export function parseStreamToolUpdate(
  message: unknown,
  existingToolCalls: ToolCall[] = [],
): StreamToolUpdate | null {
  if (!message || typeof message !== "object") return null;

  const record = message as Record<string, unknown>;

  if (record.type === "assistant") {
    const msg = record.message as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) return null;

    const toolUses = msg.content.filter(
      (
        block,
      ): block is {
        type: "tool_use";
        id: string;
        name: string;
        input: unknown;
      } =>
        block != null &&
        typeof block === "object" &&
        (block as { type?: string }).type === "tool_use",
    );
    if (toolUses.length === 0) return null;

    let toolCalls = existingToolCalls.filter(
      (toolCall) =>
        !(
          toolCall.id.startsWith("pending-") &&
          toolUses.some((toolUse) => toolUse.name === toolCall.toolName)
        ),
    );
    for (const toolUse of toolUses) {
      toolCalls = upsertToolCall(toolCalls, {
        id: toolUse.id,
        toolName: toolUse.name,
        input: toolUse.input,
        status: "running",
      });
    }

    return { toolCalls, isStreaming: false };
  }

  if (record.type === "tool_result") {
    const result = record.result as
      | { tool_use_id?: string; tool_name?: string; output?: string }
      | undefined;
    if (!result?.tool_use_id) return null;

    const toolCalls = existingToolCalls.map((toolCall) =>
      toolCall.id === result.tool_use_id
        ? {
            ...toolCall,
            toolName: result.tool_name || toolCall.toolName,
            status: "completed" as const,
            output: { success: true, data: result.output },
          }
        : toolCall,
    );
    const hasRunning = toolCalls.some(
      (toolCall) => toolCall.status === "running",
    );

    return { toolCalls, isStreaming: !hasRunning };
  }

  if (record.type === "partial_message") {
    const partial = record.partial as
      | { type?: string; name?: string; input?: string }
      | undefined;
    if (partial?.type !== "tool_use" || !partial.name) return null;

    const pendingId = `pending-${partial.name}`;
    const toolCalls = upsertToolCall(existingToolCalls, {
      id: pendingId,
      toolName: partial.name,
      input: partial.input ? { _raw: partial.input } : {},
      status: "pending",
    });

    return { toolCalls, isStreaming: false };
  }

  return null;
}
