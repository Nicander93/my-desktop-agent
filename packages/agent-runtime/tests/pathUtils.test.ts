import { describe, it, expect } from 'vitest';
import { extractPathsFromToolInput } from '../src/pathUtils';

describe('extractPathsFromToolInput', () => {
  it('extracts path fields from tool input', () => {
    expect(extractPathsFromToolInput('file', {
      action: 'read',
      path: '/workspace/src/index.ts',
      cwd: '/workspace'
    })).toEqual(['/workspace/src/index.ts', '/workspace']);
  });

  it('returns empty array for non-object input', () => {
    expect(extractPathsFromToolInput('file', null)).toEqual([]);
  });
});
