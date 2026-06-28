// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  extractMessageText,
  extractToolNames,
  isSimpleToolInput,
  normalizeTraceMessage,
  parseContentBlocks,
  summarizeLlmRequest,
  summarizeLlmResponse,
  summarizeToolPayload,
} from '../src/lib/llmTraceFormat';

describe('extractMessageText', () => {
  it('returns string content as-is', () => {
    expect(extractMessageText('hello')).toBe('hello');
  });

  it('extracts text blocks from array', () => {
    const content = [
      { type: 'text', text: 'line one' },
      { type: 'text', text: 'line two' },
    ];
    expect(extractMessageText(content)).toBe('line one\nline two');
  });

  it('handles tool_use blocks', () => {
    const content = [{ type: 'tool_use', name: 'Read', input: { path: 'a.ts' } }];
    expect(extractMessageText(content)).toBe('[tool_use: Read]');
  });

  it('returns empty string for null', () => {
    expect(extractMessageText(null)).toBe('');
  });
});

describe('normalizeTraceMessage', () => {
  it('normalizes user message with string content', () => {
    const result = normalizeTraceMessage({ role: 'user', content: 'hi there' });
    expect(result.role).toBe('user');
    expect(result.text).toBe('hi there');
    expect(result.isLong).toBe(false);
  });

  it('marks long messages', () => {
    const longText = 'x'.repeat(400);
    const result = normalizeTraceMessage({ role: 'assistant', content: longText });
    expect(result.isLong).toBe(true);
    expect(result.preview).toHaveLength(300);
    expect(result.text).toBe(longText);
  });
});

describe('summarizeLlmRequest', () => {
  it('summarizes request payload', () => {
    const system = 'You are helpful.\nUse tools wisely.';
    const result = summarizeLlmRequest({
      model: 'gpt-4',
      system,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'Read' }],
      estimatedInputTokens: 1200,
    });
    expect(result.systemLen).toBe(system.length);
    expect(result.messageCount).toBe(1);
    expect(result.toolCount).toBe(1);
    expect(result.estimatedTokens).toBe(1200);
    expect(system).not.toContain('\\n');
  });
});

describe('summarizeLlmResponse', () => {
  it('summarizes response payload', () => {
    const result = summarizeLlmResponse({
      content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'Bash' }],
      stopReason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    expect(result.stopReason).toBe('tool_use');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(20);
    expect(result.blockTypes).toEqual(['text', 'tool_use']);
    expect(result.blockCount).toBe(2);
  });
});

describe('summarizeToolPayload', () => {
  it('summarizes tool_call', () => {
    const result = summarizeToolPayload(
      { toolUseId: 't1', name: 'Read', input: { path: 'a.ts', offset: 1 } },
      'tool_call',
    );
    expect(result.name).toBe('Read');
    expect(result.inputKeyCount).toBe(2);
  });

  it('summarizes tool_result', () => {
    const result = summarizeToolPayload(
      { toolUseId: 't1', name: 'Read', output: 'file content', isError: false },
      'tool_result',
    );
    expect(result.outputLen).toBe(12);
    expect(result.isError).toBe(false);
  });
});

describe('isSimpleToolInput', () => {
  it('returns true for few simple values', () => {
    expect(isSimpleToolInput({ path: 'a.ts', offset: 1 })).toBe(true);
  });

  it('returns false for nested objects', () => {
    expect(isSimpleToolInput({ data: { nested: true } })).toBe(false);
  });

  it('returns false for many keys', () => {
    expect(
      isSimpleToolInput({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }),
    ).toBe(false);
  });
});

describe('extractToolNames', () => {
  it('extracts direct name', () => {
    expect(extractToolNames([{ name: 'Read' }, { name: 'Write' }])).toEqual(['Read', 'Write']);
  });

  it('extracts function.name', () => {
    expect(extractToolNames([{ function: { name: 'Bash' } }])).toEqual(['Bash']);
  });
});

describe('parseContentBlocks', () => {
  it('parses mixed content blocks', () => {
    const blocks = parseContentBlocks([
      { type: 'text', text: 'hello' },
      { type: 'tool_use', name: 'Read', input: { path: 'x' } },
    ]);
    expect(blocks[0]).toMatchObject({ type: 'text', text: 'hello' });
    expect(blocks[1]).toMatchObject({ type: 'tool_use', name: 'Read' });
  });
});
