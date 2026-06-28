// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseAssistantSegments,
  getStreamPhase,
  shouldShowThought,
  extractStreamTextUpdate,
  reconcileStreamThinking,
} from '../src/lib/agentMessage';
import { summarizeToolActivityGroups } from '../src/lib/toolActivitySummary';

describe('parseAssistantSegments', () => {
  it('puts text before tool_use into thinking', () => {
    const { thinking, response } = parseAssistantSegments(
      [
        { type: 'text', text: '先分析一下结构' },
        { type: 'tool_use', id: '1', name: 'Read', input: {} },
      ],
      false,
    );
    expect(thinking).toBe('先分析一下结构');
    expect(response).toBe('');
  });

  it('puts text-only message into response when tools already ran', () => {
    const { thinking, response } = parseAssistantSegments(
      [{ type: 'text', text: '最终结论' }],
      true,
    );
    expect(thinking).toBe('');
    expect(response).toBe('最终结论');
  });

  it('extracts thinking blocks with response text', () => {
    const { thinking, response } = parseAssistantSegments(
      [
        { type: 'thinking', thinking: '内部推理' },
        { type: 'text', text: '最终回答' },
      ],
      false,
    );
    expect(thinking).toBe('内部推理');
    expect(response).toBe('最终回答');
  });
});

describe('getStreamPhase', () => {
  it('returns responding when no tools', () => {
    expect(getStreamPhase([])).toBe('responding');
  });

  it('returns thinking while tools are active', () => {
    expect(getStreamPhase([{ id: '1', toolName: 'Read', input: {}, status: 'running' }])).toBe('thinking');
  });

  it('returns responding after tools complete', () => {
    expect(getStreamPhase([{ id: '1', toolName: 'Read', input: {}, status: 'completed' }])).toBe('responding');
  });
});

describe('shouldShowThought', () => {
  it('hides thought when thinking equals content', () => {
    expect(shouldShowThought({
      thinking: '你好',
      content: '你好',
    })).toBe(false);
  });

  it('shows SDK thinking without tools when it differs from content', () => {
    expect(shouldShowThought({
      thinking: '先分析结构',
      content: '最终报告',
    })).toBe(true);
  });

  it('shows thought while only thinking is streaming', () => {
    expect(shouldShowThought({
      thinking: '推理中...',
      content: '',
    })).toBe(true);
  });
});

describe('reconcileStreamThinking', () => {
  it('does not duplicate when assistant repeats streamed thinking', () => {
    const text = '用户用中文打招呼，我应该礼貌回应。';
    expect(reconcileStreamThinking(text, text)).toBe(text);
  });

  it('uses authoritative full text when incoming extends partial', () => {
    expect(reconcileStreamThinking('步骤1', '步骤1步骤2')).toBe('步骤1步骤2');
  });

  it('appends new thinking segment after tools', () => {
    expect(reconcileStreamThinking('第一轮', '第二轮')).toBe('第一轮\n\n第二轮');
  });
});

describe('extractStreamTextUpdate', () => {
  it('appends thinking partial chunks', () => {
    const update = extractStreamTextUpdate(
      { type: 'partial_message', partial: { type: 'thinking', thinking: '步骤1' } },
      { content: '', thinking: '已有' },
    );
    expect(update).toEqual({ thinking: '已有步骤1' });
  });

  it('ignores text partial while tools are active', () => {
    const update = extractStreamTextUpdate(
      { type: 'partial_message', partial: { type: 'text', text: '不应出现' } },
      {
        content: '',
        toolCalls: [{ id: '1', toolName: 'Read', input: {}, status: 'running' }],
      },
    );
    expect(update).toBeNull();
  });

  it('does not duplicate thinking from final assistant message', () => {
    const thinking = '用户用中文打招呼，我应该礼貌回应。';
    const update = extractStreamTextUpdate(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking },
            { type: 'text', text: '你好！' },
          ],
        },
      },
      { content: '你好！', thinking },
    );
    expect(update?.thinking).toBe(thinking);
  });
});

describe('summarizeToolActivityGroups', () => {
  it('groups explore and edit actions', () => {
    const lines = summarizeToolActivityGroups([
      { id: '1', toolName: 'Read', input: {}, status: 'completed' },
      { id: '2', toolName: 'Glob', input: {}, status: 'completed' },
      { id: '3', toolName: 'Edit', input: {}, status: 'completed' },
      { id: '4', toolName: 'Bash', input: {}, status: 'completed' },
    ]);
    expect(lines).toEqual(['Explored 2 files', 'Edited 1 file', 'ran 1 command']);
  });
});
