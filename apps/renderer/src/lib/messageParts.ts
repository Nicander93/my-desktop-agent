/**
 * 流式 MessagePart 组装：thinking、正文、tool_group 顺序
 */
import type { MessagePart } from "@desktop-agent/shared";
import type { ToolCall } from "@/stores/chatStore";
import { reconcileStreamThinking } from "@/lib/agentMessage";
import { applyStreamToolResult } from "@/lib/toolCallSync";

/** 渲染端流式消息的规范 parts、工具调用与流式标志。 */
export interface MessagePartState {
  parts: MessagePart[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

let partIdCounter = 0;

/** 生成本次页面生命周期内唯一的 part ID，避免流式合并时丢失 React key。 */
function createPartId(): string {
  partIdCounter += 1;
  return `part-${Date.now()}-${partIdCounter}`;
}

/** 以不引入额外分隔符的方式拼接 SSE 文本增量。 */
function appendText(existing: string, chunk: string): string {
  if (!chunk) return existing;
  if (!existing) return chunk;
  return existing + chunk;
}

/** 合并工具调用更新，并在首次活动状态时记录本地开始时间。 */
function upsertToolCall(toolCalls: ToolCall[], entry: ToolCall): ToolCall[] {
  const idx = toolCalls.findIndex((t) => t.id === entry.id);
  if (idx >= 0) {
    const next = [...toolCalls];
    const merged = { ...next[idx], ...entry };
    if (
      merged.startedAt == null &&
      (merged.status === "running" || merged.status === "pending")
    ) {
      merged.startedAt = Date.now();
    }
    next[idx] = merged;
    return next;
  }
  const created = { ...entry };
  if (
    created.startedAt == null &&
    (created.status === "running" || created.status === "pending")
  ) {
    created.startedAt = Date.now();
  }
  return [...toolCalls, created];
}

/** 判断是否仍有未完成工具，文本增量不能越过活动工具组。 */
function hasActiveTools(toolCalls: ToolCall[]): boolean {
  return toolCalls.some(
    (t) => t.status === "running" || t.status === "pending",
  );
}

/** 查找最后一个仍包含活动工具的工具组，后续调用应合并到该组。 */
function getOpenToolGroupIndex(
  parts: MessagePart[],
  toolCalls: ToolCall[],
): number {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part.type !== "tool_group") continue;
    const active = part.toolCallIds.some((id) => {
      const tc = toolCalls.find((t) => t.id === id);
      return tc && (tc.status === "running" || tc.status === "pending");
    });
    if (active) return i;
  }
  return -1;
}

/** 追加或协调 thinking 增量，兼容 Provider 重发完整片段的情况。 */
function appendThinkingPart(
  parts: MessagePart[],
  chunk: string,
  reconcile = false,
): MessagePart[] {
  if (!chunk) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === "thinking") {
    const text = reconcile
      ? reconcileStreamThinking(last.text, chunk)
      : appendText(last.text, chunk);
    return [...parts.slice(0, -1), { ...last, text }];
  }
  if (last?.type === "text") {
    const prev = parts[parts.length - 2];
    if (prev?.type === "thinking") {
      const text = reconcile
        ? reconcileStreamThinking(prev.text, chunk)
        : appendText(prev.text, chunk);
      return [...parts.slice(0, -2), { ...prev, text }, last];
    }
    return [
      ...parts.slice(0, -1),
      { type: "thinking", id: createPartId(), text: chunk },
      last,
    ];
  }
  return [...parts, { type: "thinking", id: createPartId(), text: chunk }];
}

/** 比较用户可见文本，忽略流式边界带来的首尾空白差异。 */
function isSameVisibleText(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/** 在不破坏 thinking/tool_group 顺序的前提下追加正文增量。 */
function appendTextPart(parts: MessagePart[], chunk: string): MessagePart[] {
  if (!chunk) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === "thinking") {
    if (isSameVisibleText(last.text, chunk)) return parts;
    const trimmedChunk = chunk.trim();
    if (
      trimmedChunk &&
      last.text.includes(trimmedChunk) &&
      trimmedChunk.length < last.text.trim().length
    ) {
      return parts;
    }
    return [...parts, { type: "text", id: createPartId(), text: chunk }];
  }
  if (last?.type === "tool_group") {
    return [...parts, { type: "text", id: createPartId(), text: chunk }];
  }
  if (last?.type === "text") {
    if (isSameVisibleText(last.text, chunk)) return parts;
    return [
      ...parts.slice(0, -1),
      { ...last, text: appendText(last.text, chunk) },
    ];
  }
  return [...parts, { type: "text", id: createPartId(), text: chunk }];
}

/** 用最终 assistant 块校正流式正文，避免重复显示已累积的增量。 */
function setTextPart(parts: MessagePart[], text: string): MessagePart[] {
  if (!text) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === "thinking" && isSameVisibleText(last.text, text)) {
    return [...parts.slice(0, -1), { type: "text", id: createPartId(), text }];
  }
  if (last?.type === "text") {
    if (isSameVisibleText(last.text, text)) return parts;
    return [...parts.slice(0, -1), { ...last, text }];
  }
  if (last?.type === "tool_group") {
    return [...parts, { type: "text", id: createPartId(), text }];
  }
  return appendTextPart(parts, text);
}

/** 将工具调用加入当前活动组，保持工具与前后文本的时间顺序。 */
function addToolToParts(
  parts: MessagePart[],
  toolId: string,
  toolCalls: ToolCall[],
): MessagePart[] {
  const openIdx = getOpenToolGroupIndex(parts, toolCalls);
  if (openIdx >= 0) {
    const group = parts[openIdx] as Extract<
      MessagePart,
      { type: "tool_group" }
    >;
    if (group.toolCallIds.includes(toolId)) return parts;
    const next = [...parts];
    next[openIdx] = { ...group, toolCallIds: [...group.toolCallIds, toolId] };
    return next;
  }
  return [
    ...parts,
    { type: "tool_group", id: createPartId(), toolCallIds: [toolId] },
  ];
}

/** 在最终 assistant 块到达前移除可被权威块替换的尾部文本与思考内容。 */
function stripTrailingResponseParts(parts: MessagePart[]): MessagePart[] {
  let end = parts.length;
  while (end > 0) {
    const part = parts[end - 1];
    if (part.type === "thinking" || part.type === "text") {
      end -= 1;
      continue;
    }
    break;
  }
  return parts.slice(0, end);
}

/** 将权威 assistant 内容块同步回增量状态，并消除临时 pending 工具。 */
function applyAssistantBlocks(
  content: unknown,
  state: MessagePartState,
): MessagePartState {
  if (!Array.isArray(content)) return state;

  let { parts, toolCalls } = state;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const type = (block as { type?: string }).type;

    if (type === "thinking" && "thinking" in block) {
      const t = (block as { thinking: string }).thinking;
      if (t) parts = appendThinkingPart(parts, t, true);
    } else if (type === "text" && "text" in block) {
      const text = (block as { text: string }).text;
      if (text) parts = setTextPart(parts, text);
    } else if (type === "tool_use") {
      const toolUse = block as { id?: string; name: string; input: unknown };
      const toolId = toolUse.id || `tool-${toolUse.name}`;
      toolCalls = upsertToolCall(toolCalls, {
        id: toolId,
        toolName: toolUse.name,
        input: toolUse.input,
        status: "running",
      });
      toolCalls = toolCalls.filter(
        (tc) => !(tc.id.startsWith("pending-") && tc.toolName === toolUse.name),
      );
      parts = addToolToParts(parts, toolId, toolCalls);
    }
  }

  return { ...state, parts, toolCalls };
}

/** 去重并修正 part 类型，区分流式尚未结束与最终落库的展示语义。 */
export function normalizeMessageParts(
  parts: MessagePart[],
  isStreaming = false,
): MessagePart[] {
  const result: MessagePart[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      const prev = result[result.length - 1];
      if (
        prev?.type === "thinking" &&
        isSameVisibleText(prev.text, part.text)
      ) {
        result[result.length - 1] = {
          type: "text",
          id: part.id,
          text: part.text,
        };
        continue;
      }
      const lastText = [...result].reverse().find((p) => p.type === "text") as
        | Extract<MessagePart, { type: "text" }>
        | undefined;
      if (lastText && isSameVisibleText(lastText.text, part.text)) {
        continue;
      }
    }

    if (part.type === "thinking") {
      const prev = result[result.length - 1];
      if (
        prev?.type === "thinking" &&
        isSameVisibleText(prev.text, part.text)
      ) {
        continue;
      }
      if (prev?.type === "text" && isSameVisibleText(prev.text, part.text)) {
        continue;
      }
    }

    result.push(part);
  }

  const normalized: MessagePart[] = [];
  for (let i = 0; i < result.length; i++) {
    const part = result[i];
    if (part.type === "thinking") {
      const next = result[i + 1];
      if (next?.type === "text") {
        normalized.push(part);
        continue;
      }
      if (next?.type === "tool_group") {
        normalized.push({ type: "text", id: part.id, text: part.text });
        continue;
      }
      if (!next && !isStreaming) {
        normalized.push({ type: "text", id: part.id, text: part.text });
        continue;
      }
    }
    normalized.push(part);
  }

  return normalized;
}

/** 从 text parts 派生兼容旧消息模型的正文。 */
export function deriveContentFromParts(parts: MessagePart[]): string {
  return parts
    .filter(
      (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
    )
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n\n");
}

/** 从 thinking parts 派生兼容旧消息模型的推理字段。 */
export function deriveThinkingFromParts(parts: MessagePart[]): string {
  return parts
    .filter(
      (p): p is Extract<MessagePart, { type: "thinking" }> =>
        p.type === "thinking",
    )
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n\n");
}

/** 将旧版扁平消息字段迁移为保序的 MessagePart 列表。 */
export function derivePartsFromLegacy(message: {
  thinking?: string;
  content?: string;
  toolCalls?: ToolCall[];
}): MessagePart[] {
  const parts: MessagePart[] = [];
  if (message.thinking?.trim()) {
    parts.push({
      type: "thinking",
      id: "legacy-thinking",
      text: message.thinking,
    });
  }
  if (message.toolCalls?.length) {
    parts.push({
      type: "tool_group",
      id: "legacy-tools",
      toolCallIds: message.toolCalls.map((t) => t.id),
    });
  }
  if (message.content?.trim()) {
    parts.push({ type: "text", id: "legacy-text", text: message.content });
  }
  return parts;
}

/** 同时返回 parts 原始状态与为旧消费者派生的正文、推理字段。 */
export function syncDerivedFields(state: MessagePartState): MessagePartState & {
  content: string;
  thinking: string;
} {
  return {
    ...state,
    content: deriveContentFromParts(state.parts),
    thinking: deriveThinkingFromParts(state.parts),
  };
}

/**
 * 将 SSE 事件增量写入 parts 与 toolCalls。
 *
 * 最终 assistant 事件优先于先前 partial 事件，确保重传或分片差异不会污染会话展示。
 */
export function applyStreamEvent(
  message: unknown,
  state: MessagePartState,
): MessagePartState & {
  content: string;
  thinking: string;
} {
  if (!message || typeof message !== "object") {
    return syncDerivedFields(state);
  }

  const record = message as Record<string, unknown>;
  let { parts, toolCalls, isStreaming } = state;

  if (record.type === "partial_message") {
    const partial = record.partial as
      | {
          type?: string;
          text?: string;
          thinking?: string;
          name?: string;
          input?: string;
        }
      | undefined;

    if (partial?.type === "thinking" && partial.thinking) {
      parts = appendThinkingPart(parts, partial.thinking);
      isStreaming = true;
    } else if (partial?.type === "text" && partial.text) {
      if (!hasActiveTools(toolCalls)) {
        parts = appendTextPart(parts, partial.text);
        isStreaming = true;
      }
    } else if (partial?.type === "tool_use" && partial.name) {
      const pendingId = `pending-${partial.name}`;
      toolCalls = upsertToolCall(toolCalls, {
        id: pendingId,
        toolName: partial.name,
        input: partial.input ? { _raw: partial.input } : {},
        status: "pending",
      });
      parts = addToolToParts(parts, pendingId, toolCalls);
      isStreaming = false;
    }
  } else if (record.type === "assistant") {
    const msg = record.message as { content?: unknown } | undefined;
    parts = stripTrailingResponseParts(parts);
    const next = applyAssistantBlocks(msg?.content, {
      parts,
      toolCalls,
      isStreaming,
    });
    parts = next.parts;
    toolCalls = next.toolCalls;
    isStreaming = false;
  } else if (record.type === "tool_result") {
    const result = record.result as
      | { tool_use_id?: string; tool_name?: string; output?: string }
      | undefined;
    if (result?.tool_use_id) {
      toolCalls = applyStreamToolResult(toolCalls, {
        tool_use_id: result.tool_use_id,
        tool_name: result.tool_name,
        output: result.output,
      });
      isStreaming = !hasActiveTools(toolCalls);
    }
  }

  return syncDerivedFields({
    parts: normalizeMessageParts(parts, isStreaming),
    toolCalls,
    isStreaming,
  });
}
