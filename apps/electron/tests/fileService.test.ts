// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../src/services/pathGuard', () => ({
  checkPathAccess: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { checkPathAccess } from '../src/services/pathGuard';
import { statFile, readFile, writeFile, readDir } from '../src/services/fileService';

const workspaceId = 'test-workspace-id';

describe('fileService', () => {
  let testDir: string;
  let textFile: string;
  let imageFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `file-service-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'src'));
    textFile = join(testDir, 'hello.txt');
    writeFileSync(textFile, 'hello world', 'utf-8');
    writeFileSync(join(testDir, 'src', 'index.ts'), 'export {}', 'utf-8');
    imageFile = join(testDir, 'pic.png');
    writeFileSync(imageFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    vi.mocked(checkPathAccess).mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('stat returns file info', async () => {
    const stat = await statFile(workspaceId, textFile, null);
    expect(stat.exists).toBe(true);
    expect(stat.isFile).toBe(true);
    expect(stat.isDirectory).toBe(false);
    expect(stat.ext).toBe('.txt');
  });

  it('stat returns exists false for missing file', async () => {
    const stat = await statFile(workspaceId, join(testDir, 'missing.txt'), null);
    expect(stat.exists).toBe(false);
  });

  it('reads text file as utf8', async () => {
    const result = await readFile(workspaceId, textFile, null);
    expect(result.encoding).toBe('utf8');
    expect(result.content).toBe('hello world');
  });

  it('reads image as base64', async () => {
    const result = await readFile(workspaceId, imageFile, null);
    expect(result.encoding).toBe('base64');
    expect(result.mimeType).toBe('image/png');
  });

  it('writes text file', async () => {
    const target = join(testDir, 'out.md');
    await writeFile(workspaceId, target, '# title', null);
    expect(readFileSync(target, 'utf-8')).toBe('# title');
  });

  it('rejects when path access denied', async () => {
    vi.mocked(checkPathAccess).mockResolvedValue({ allowed: false });
    await expect(readFile(workspaceId, textFile, null)).rejects.toThrow('路径访问被拒绝');
  });

  it('rejects unsupported binary file', async () => {
    const binFile = join(testDir, 'data.bin');
    writeFileSync(binFile, Buffer.from([0, 1, 2]));
    await expect(readFile(workspaceId, binFile, null)).rejects.toThrow('不支持预览');
  });

  it('reads directory entries sorted with dirs first', async () => {
    const entries = await readDir(workspaceId, testDir, null);
    const names = entries.map((e) => e.name);
    expect(names).toContain('hello.txt');
    expect(names).toContain('src');
    expect(names.indexOf('src')).toBeLessThan(names.indexOf('hello.txt'));
  });
});
