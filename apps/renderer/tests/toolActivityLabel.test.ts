// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getToolActivityLabel } from '../src/lib/toolActivityLabel';
import { getThinkingPreview } from '../src/lib/toolActivitySummary';

describe('getToolActivityLabel', () => {
  it('formats Read with line range', () => {
    const label = getToolActivityLabel('Read', {
      file_path: 'apps/renderer/src/components/chat/MessageItem.tsx',
      offset: 0,
      limit: 73,
    });
    expect(label).toBe('Read MessageItem.tsx L1-73');
  });

  it('formats WebSearch', () => {
    expect(getToolActivityLabel('WebSearch', {})).toBe('WebSearch');
    expect(getToolActivityLabel('WebSearch', { query: 'test' })).toBe('WebSearch test');
  });
});

describe('getThinkingPreview', () => {
  it('returns last non-empty line', () => {
    expect(getThinkingPreview('第一行\n第二行')).toBe('第二行');
  });
});
