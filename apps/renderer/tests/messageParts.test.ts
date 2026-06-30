// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyStreamEvent,
  deriveContentFromParts,
  derivePartsFromLegacy,
  deriveThinkingFromParts,
} from '../src/lib/messageParts';
import type { ToolCall } from '../src/stores/chatStore';

const emptyState = { parts: [], toolCalls: [], isStreaming: false };

describe('applyStreamEvent', () => {
  it('creates separate text parts after tool_group', () => {
    let state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'text', text: '第一段' } },
      emptyState,
    );
    state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'tool_use', name: 'Read' } },
      state,
    );
    state = applyStreamEvent(
      { type: 'tool_result', result: { tool_use_id: 'pending-Read', tool_name: 'Read', output: 'ok' } },
      state,
    );
    state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'text', text: '第二段' } },
      state,
    );

    expect(state.parts).toHaveLength(3);
    expect(state.parts[0]).toMatchObject({ type: 'text', text: '第一段' });
    expect(state.parts[1]).toMatchObject({ type: 'tool_group' });
    expect(state.parts[2]).toMatchObject({ type: 'text', text: '第二段' });
    expect(state.content).toBe('第一段\n\n第二段');
  });

  it('parses assistant blocks in order: text → tool → text', () => {
    const state = applyStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '先分析结构' },
            { type: 'tool_use', id: 't1', name: 'Read', input: {} },
            { type: 'text', text: '最终结论' },
          ],
        },
      },
      emptyState,
    );

    expect(state.parts).toHaveLength(3);
    expect(state.parts[0]).toMatchObject({ type: 'text', text: '先分析结构' });
    expect(state.parts[1]).toMatchObject({ type: 'tool_group', toolCallIds: ['t1'] });
    expect(state.parts[2]).toMatchObject({ type: 'text', text: '最终结论' });
    expect(state.content).toBe('先分析结构\n\n最终结论');
  });

  it('creates new tool_group when previous tools completed', () => {
    const toolCalls: ToolCall[] = [
      { id: 't1', toolName: 'Read', input: {}, status: 'completed' },
    ];
    const state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'tool_use', name: 'Bash' } },
      { parts: [{ type: 'tool_group', id: 'g1', toolCallIds: ['t1'] }], toolCalls, isStreaming: false },
    );

    expect(state.parts).toHaveLength(2);
    expect(state.parts[1]).toMatchObject({ type: 'tool_group', toolCallIds: ['pending-Bash'] });
  });

  it('ignores text partial while tools are active', () => {
    const state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'text', text: '不应出现' } },
      {
        parts: [],
        toolCalls: [{ id: '1', toolName: 'Read', input: {}, status: 'running' }],
        isStreaming: false,
      },
    );

    expect(state.parts).toHaveLength(0);
    expect(state.content).toBe('');
  });

  it('appends thinking partials to thinking part', () => {
    const state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'thinking', thinking: '步骤1' } },
      { ...emptyState, parts: [{ type: 'thinking', id: 't1', text: '已有' }] },
    );

    expect(state.parts).toHaveLength(1);
    expect(state.parts[0]).toMatchObject({ type: 'thinking', text: '已有步骤1' });
  });

  it('replaces streamed thinking/text when assistant message arrives', () => {
    let state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'thinking', thinking: '推理中' } },
      emptyState,
    );
    state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'text', text: '最终回答' } },
      state,
    );
    state = applyStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '推理中' },
            { type: 'text', text: '最终回答' },
          ],
        },
      },
      state,
    );

    expect(state.parts).toHaveLength(2);
    expect(state.parts.map((p) => p.type)).toEqual(['thinking', 'text']);
    expect(state.content).toBe('最终回答');
    expect(state.thinking).toBe('推理中');
  });

  it('keeps separate thinking/text pairs across tool turns', () => {
    let state = applyStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '第一轮思考' },
            { type: 'text', text: '第一轮回答' },
            { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
          ],
        },
      },
      emptyState,
    );
    state = applyStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '第二轮思考' },
            { type: 'text', text: '第二轮回答' },
          ],
        },
      },
      state,
    );

    expect(state.parts.map((p) => p.type)).toEqual(['thinking', 'text', 'tool_group', 'thinking', 'text']);
    expect(state.content).toBe('第一轮回答\n\n第二轮回答');
    expect(state.thinking).toBe('第一轮思考\n\n第二轮思考');
  });

  it('merges thinking partials that arrive after text started', () => {
    let state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'thinking', thinking: '好的' } },
      emptyState,
    );
    state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'text', text: '好的' } },
      state,
    );
    state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'thinking', thinking: '！我来创建 PPT' } },
      state,
    );
    state = applyStreamEvent(
      { type: 'partial_message', partial: { type: 'text', text: '！我来创建 PPT' } },
      state,
    );
    state = applyStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '好的！我来创建 PPT' },
            { type: 'text', text: '好的！我来创建 PPT' },
          ],
        },
      },
      state,
    );

    expect(state.parts.map((p) => p.type)).toEqual(['text']);
    expect(state.content).toBe('好的！我来创建 PPT');
  });

  it('collapses duplicate thinking/text with same content', () => {
    const state = applyStreamEvent(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '同样的内容' },
            { type: 'text', text: '同样的内容' },
          ],
        },
      },
      emptyState,
    );

    expect(state.parts.map((p) => p.type)).toEqual(['text']);
    expect(state.content).toBe('同样的内容');
    expect(state.thinking).toBe('');
  });
});

describe('derivePartsFromLegacy', () => {
  it('builds thinking → tools → text order', () => {
    const parts = derivePartsFromLegacy({
      thinking: '内部推理',
      content: '最终回答',
      toolCalls: [{ id: '1', toolName: 'Read', input: {}, status: 'completed' }],
    });

    expect(parts.map((p) => p.type)).toEqual(['thinking', 'tool_group', 'text']);
    expect(deriveContentFromParts(parts)).toBe('最终回答');
    expect(deriveThinkingFromParts(parts)).toBe('内部推理');
  });
});

describe('deriveContentFromParts', () => {
  it('joins text parts with double newline', () => {
    const content = deriveContentFromParts([
      { type: 'text', id: '1', text: 'A' },
      { type: 'tool_group', id: '2', toolCallIds: [] },
      { type: 'text', id: '3', text: 'B' },
    ]);
    expect(content).toBe('A\n\nB');
  });
});
