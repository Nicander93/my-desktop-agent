// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { splitMarkdownBlocks } from '../src/lib/splitMarkdownBlocks';

describe('splitMarkdownBlocks', () => {
  it('returns empty for empty content when not streaming', () => {
    expect(splitMarkdownBlocks('')).toEqual([]);
  });

  it('returns incomplete empty block when streaming with no content', () => {
    expect(splitMarkdownBlocks('', true)).toEqual([
      { id: '0', content: '', complete: false },
    ]);
  });

  it('splits paragraphs on double newline', () => {
    const blocks = splitMarkdownBlocks('Hello\n\nWorld');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ content: 'Hello\n\n', complete: true });
    expect(blocks[1]).toMatchObject({ content: 'World', complete: true });
  });

  it('keeps tail incomplete while streaming', () => {
    const blocks = splitMarkdownBlocks('Done\n\nStill typing', true);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].complete).toBe(true);
    expect(blocks[1]).toMatchObject({ content: 'Still typing', complete: false });
  });

  it('treats fenced code block as single block when closed', () => {
    const content = '```js\nconst x = 1;\n```';
    const blocks = splitMarkdownBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(content);
    expect(blocks[0].complete).toBe(true);
  });

  it('does not split inside unclosed code fence while streaming', () => {
    const content = '```js\nconst x = 1;';
    const blocks = splitMarkdownBlocks(content, true);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].complete).toBe(false);
  });

  it('splits text before code block and code block separately', () => {
    const content = 'intro\n\n```\ncode\n```';
    const blocks = splitMarkdownBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toBe('intro\n\n');
    expect(blocks[1].content).toBe('```\ncode\n```');
  });

  it('completes tail when stream ends', () => {
    const blocks = splitMarkdownBlocks('partial text', false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].complete).toBe(true);
  });
});
