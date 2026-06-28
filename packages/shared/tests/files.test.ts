import { describe, expect, it } from 'vitest';
import { parseFileMentions, buildFileMentionPrompt } from '../src/files/mentions.js';

describe('parseFileMentions', () => {
  it('extracts @ paths from message', () => {
    const refs = parseFileMentions('请修改 @apps/renderer/src/App.tsx 和 @packages/shared');
    expect(refs).toEqual(['apps/renderer/src/App.tsx', 'packages/shared']);
  });

  it('returns empty for no mentions', () => {
    expect(parseFileMentions('hello')).toEqual([]);
  });
});

describe('buildFileMentionPrompt', () => {
  it('builds path hint for agent', () => {
    const prompt = buildFileMentionPrompt(['apps/renderer/src/App.tsx']);
    expect(prompt).toContain('apps/renderer/src/App.tsx');
    expect(prompt).toContain('文件工具');
  });
});
