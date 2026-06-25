// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { splitTextWithFilePaths, FILE_PATH_REGEX } from '../src/lib/filePathUtils';

describe('filePathUtils', () => {
  it('matches Windows path', () => {
    const text = '文件路径：D:\\code-study\\dbx\\readme.md';
    const matches = [...text.matchAll(FILE_PATH_REGEX)].map((m) => m[0]);
    expect(matches).toContain('D:\\code-study\\dbx\\readme.md');
  });

  it('matches Unix path', () => {
    const text = 'see /home/user/project/app.ts for details';
    const matches = [...text.matchAll(FILE_PATH_REGEX)].map((m) => m[0]);
    expect(matches).toContain('/home/user/project/app.ts');
  });

  it('splits text with file paths', () => {
    const segments = splitTextWithFilePaths('创建于 D:\\proj\\a.txt 完成');
    expect(segments).toEqual([
      { type: 'text', value: '创建于 ' },
      { type: 'path', value: 'D:\\proj\\a.txt' },
      { type: 'text', value: ' 完成' },
    ]);
  });

  it('returns single text segment when no path', () => {
    expect(splitTextWithFilePaths('普通文本')).toEqual([{ type: 'text', value: '普通文本' }]);
  });

  it('handles multiple paths', () => {
    const segments = splitTextWithFilePaths('D:\\a.txt and D:\\b.js');
    expect(segments.filter((s) => s.type === 'path')).toHaveLength(2);
  });
});
