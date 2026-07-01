import type { MessagePart } from '@desktop-agent/shared';
import type { ToolCall } from '@/stores/chatStore';
import { reconcileStreamThinking } from '@/lib/agentMessage';
import { applyStreamToolResult } from '@/lib/toolCallSync';

export interface MessagePartState {
  parts: MessagePart[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

let partIdCounter = 0;

function createPartId(): string {
  partIdCounter += 1;
  return `part-${Date.now()}-${partIdCounter}`;
}

function appendText(existing: string, chunk: string): string {
  if (!chunk) return existing;
  if (!existing) return chunk;
  return existing + chunk;
}

function upsertToolCall(toolCalls: ToolCall[], entry: ToolCall): ToolCall[] {
  const idx = toolCalls.findIndex((t) => t.id === entry.id);
  if (idx >= 0) {
    const next = [...toolCalls];
    const merged = { ...next[idx], ...entry };
    if (merged.startedAt == null && (merged.status === 'running' || merged.status === 'pending')) {
      merged.startedAt = Date.now();
    }
    next[idx] = merged;
    return next;
  }
  const created = { ...entry };
  if (created.startedAt == null && (created.status === 'running' || created.status === 'pending')) {
    created.startedAt = Date.now();
  }
  return [...toolCalls, created];
}

function hasActiveTools(toolCalls: ToolCall[]): boolean {
  return toolCalls.some((t) => t.status === 'running' || t.status === 'pending');
}

function getOpenToolGroupIndex(parts: MessagePart[], toolCalls: ToolCall[]): number {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part.type !== 'tool_group') continue;
    const active = part.toolCallIds.some((id) => {
      const tc = toolCalls.find((t) => t.id === id);
      return tc && (tc.status === 'running' || tc.status === 'pending');
    });
    if (active) return i;
  }
  return -1;
}

function appendThinkingPart(parts: MessagePart[], chunk: string, reconcile = false): MessagePart[] {
  if (!chunk) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'thinking') {
    const text = reconcile ? reconcileStreamThinking(last.text, chunk) : appendText(last.text, chunk);
    return [...parts.slice(0, -1), { ...last, text }];
  }
  if (last?.type === 'text') {
    const prev = parts[parts.length - 2];
    if (prev?.type === 'thinking') {
      const text = reconcile ? reconcileStreamThinking(prev.text, chunk) : appendText(prev.text, chunk);
      return [...parts.slice(0, -2), { ...prev, text }, last];
    }
    return [
      ...parts.slice(0, -1),
      { type: 'thinking', id: createPartId(), text: chunk },
      last,
    ];
  }
  return [...parts, { type: 'thinking', id: createPartId(), text: chunk }];
}

function isSameVisibleText(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

function appendTextPart(parts: MessagePart[], chunk: string): MessagePart[] {
  if (!chunk) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'thinking') {
    if (isSameVisibleText(last.text, chunk)) return parts;
    const trimmedChunk = chunk.trim();
    if (trimmedChunk && last.text.includes(trimmedChunk) && trimmedChunk.length < last.text.trim().length) {
      return parts;
    }
    return [...parts, { type: 'text', id: createPartId(), text: chunk }];
  }
  if (last?.type === 'tool_group') {
    return [...parts, { type: 'text', id: createPartId(), text: chunk }];
  }
  if (last?.type === 'text') {
    if (isSameVisibleText(last.text, chunk)) return parts;
    return [...parts.slice(0, -1), { ...last, text: appendText(last.text, chunk) }];
  }
  return [...parts, { type: 'text', id: createPartId(), text: chunk }];
}

function setTextPart(parts: MessagePart[], text: string): MessagePart[] {
  if (!text) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'thinking' && isSameVisibleText(last.text, text)) {
    return [...parts.slice(0, -1), { type: 'text', id: createPartId(), text }];
  }
  if (last?.type === 'text') {
    if (isSameVisibleText(last.text, text)) return parts;
    return [...parts.slice(0, -1), { ...last, text }];
  }
  if (last?.type === 'tool_group') {
    return [...parts, { type: 'text', id: createPartId(), text }];
  }
  return appendTextPart(parts, text);
}

function addToolToParts(parts: MessagePart[], toolId: string, toolCalls: ToolCall[]): MessagePart[] {
  const openIdx = getOpenToolGroupIndex(parts, toolCalls);
  if (openIdx >= 0) {
    const group = parts[openIdx] as Extract<MessagePart, { type: 'tool_group' }>;
    if (group.toolCallIds.includes(toolId)) return parts;
    const next = [...parts];
    next[openIdx] = { ...group, toolCallIds: [...group.toolCallIds, toolId] };
    return next;
  }
  return [...parts, { type: 'tool_group', id: createPartId(), toolCallIds: [toolId] }];
}

function stripTrailingResponseParts(parts: MessagePart[]): MessagePart[] {
  let end = parts.length;
  while (end > 0) {
    const part = parts[end - 1];
    if (part.type === 'thinking' || part.type === 'text') {
      end -= 1;
      continue;
    }
    break;
  }
  return parts.slice(0, end);
}

function applyAssistantBlocks(content: unknown, state: MessagePartState): MessagePartState {
  if (!Array.isArray(content)) return state;

  let { parts, toolCalls } = state;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const type = (block as { type?: string }).type;

    if (type === 'thinking' && 'thinking' in block) {
      const t = (block as { thinking: string }).thinking;
      if (t) parts = appendThinkingPart(parts, t, true);
    } else if (type === 'text' && 'text' in block) {
      const text = (block as { text: string }).text;
      if (text) parts = setTextPart(parts, text);
    } else if (type === 'tool_use') {
      const toolUse = block as { id?: string; name: string; input: unknown };
      const toolId = toolUse.id || `tool-${toolUse.name}`;
      toolCalls = upsertToolCall(toolCalls, {
        id: toolId,
        toolName: toolUse.name,
        input: toolUse.input,
        status: 'running',
      });
      toolCalls = toolCalls.filter(
        (tc) => !(tc.id.startsWith('pending-') && tc.toolName === toolUse.name),
      );
      parts = addToolToParts(parts, toolId, toolCalls);
    }
  }

  return { ...state, parts, toolCalls };
}

export function normalizeMessageParts(parts: MessagePart[], isStreaming = false): MessagePart[] {
  const result: MessagePart[] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      const prev = result[result.length - 1];
      if (prev?.type === 'thinking' && isSameVisibleText(prev.text, part.text)) {
        result[result.length - 1] = { type: 'text', id: part.id, text: part.text };
        continue;
      }
      const lastText = [...result].reverse().find((p) => p.type === 'text') as
        | Extract<MessagePart, { type: 'text' }>
        | undefined;
      if (lastText && isSameVisibleText(lastText.text, part.text)) {
        continue;
      }
    }

    if (part.type === 'thinking') {
      const prev = result[result.length - 1];
      if (prev?.type === 'thinking' && isSameVisibleText(prev.text, part.text)) {
        continue;
      }
      if (prev?.type === 'text' && isSameVisibleText(prev.text, part.text)) {
        continue;
      }
    }

    result.push(part);
  }

  const normalized: MessagePart[] = [];
  for (let i = 0; i < result.length; i++) {
    const part = result[i];
    if (part.type === 'thinking') {
      const next = result[i + 1];
      if (next?.type === 'text') {
        normalized.push(part);
        continue;
      }
      if (next?.type === 'tool_group') {
        normalized.push({ type: 'text', id: part.id, text: part.text });
        continue;
      }
      if (!next && !isStreaming) {
        normalized.push({ type: 'text', id: part.id, text: part.text });
        continue;
      }
    }
    normalized.push(part);
  }

  return normalized;
}

export function deriveContentFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n\n');
}

export function deriveThinkingFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { type: 'thinking' }> => p.type === 'thinking')
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n\n');
}

export function derivePartsFromLegacy(message: {
  thinking?: string;
  content?: string;
  toolCalls?: ToolCall[];
}): MessagePart[] {
  const parts: MessagePart[] = [];
  if (message.thinking?.trim()) {
    parts.push({ type: 'thinking', id: 'legacy-thinking', text: message.thinking });
  }
  if (message.toolCalls?.length) {
    parts.push({
      type: 'tool_group',
      id: 'legacy-tools',
      toolCallIds: message.toolCalls.map((t) => t.id),
    });
  }
  if (message.content?.trim()) {
    parts.push({ type: 'text', id: 'legacy-text', text: message.content });
  }
  return parts;
}

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

export function applyStreamEvent(message: unknown, state: MessagePartState): MessagePartState & {
  content: string;
  thinking: string;
} {
  if (!message || typeof message !== 'object') {
    return syncDerivedFields(state);
  }

  const record = message as Record<string, unknown>;
  let { parts, toolCalls, isStreaming } = state;

  if (record.type === 'partial_message') {
    const partial = record.partial as {
      type?: string;
      text?: string;
      thinking?: string;
      name?: string;
      input?: string;
    } | undefined;

    if (partial?.type === 'thinking' && partial.thinking) {
      parts = appendThinkingPart(parts, partial.thinking);
      isStreaming = true;
    } else if (partial?.type === 'text' && partial.text) {
      if (!hasActiveTools(toolCalls)) {
        parts = appendTextPart(parts, partial.text);
        isStreaming = true;
      }
    } else if (partial?.type === 'tool_use' && partial.name) {
      const pendingId = `pending-${partial.name}`;
      toolCalls = upsertToolCall(toolCalls, {
        id: pendingId,
        toolName: partial.name,
        input: partial.input ? { _raw: partial.input } : {},
        status: 'pending',
      });
      parts = addToolToParts(parts, pendingId, toolCalls);
      isStreaming = false;
    }
  } else if (record.type === 'assistant') {
    const msg = record.message as { content?: unknown } | undefined;
    parts = stripTrailingResponseParts(parts);
    const next = applyAssistantBlocks(msg?.content, { parts, toolCalls, isStreaming });
    parts = next.parts;
    toolCalls = next.toolCalls;
    isStreaming = false;
  } else if (record.type === 'tool_result') {
    const result = record.result as { tool_use_id?: string; tool_name?: string; output?: string } | undefined;
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
