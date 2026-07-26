/** Edit 工具：CRLF 文件可用 LF old_string 匹配，写回保留原 EOL */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileEditTool } from '../src/tools/edit.js';

describe('FileEditTool line endings', () => {
  it('matches LF old_string against CRLF file content and preserves CRLF on write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'edit-eol-'));
    const filePath = join(dir, 'filter.js');
    await writeFile(
      filePath,
      'export function filterVisible(items, query) {\r\n  return items.filter((item) => item.name.startsWith(query));\r\n}\r\n',
      'utf8',
    );

    const result = await FileEditTool.call(
      {
        file_path: filePath,
        old_string: 'item.name.startsWith(query)',
        new_string: 'item.name.includes(query)',
      },
      { cwd: dir },
    );

    expect(result.is_error).toBeFalsy();
    const written = await readFile(filePath, 'utf8');
    expect(written).toContain('includes(query)');
    expect(written.includes('\r\n')).toBe(true);
  });

  it('still fails when text really is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'edit-eol-'));
    const filePath = join(dir, 'a.js');
    await writeFile(filePath, 'const a = 1;\r\n', 'utf8');

    const result = await FileEditTool.call(
      {
        file_path: filePath,
        old_string: 'const b = 2;',
        new_string: 'const b = 3;',
      },
      { cwd: dir },
    );

    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain('old_string not found');
  });
});
