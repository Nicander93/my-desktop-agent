// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { searchFiles } from '../src/services/fileSearch';

describe('fileSearch', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `file-search-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'apps', 'renderer', 'src'), { recursive: true });
    mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(testDir, 'dist'), { recursive: true });

    writeFileSync(join(testDir, 'apps', 'renderer', 'src', 'App.tsx'), 'export {}', 'utf-8');
    writeFileSync(join(testDir, 'apps', 'renderer', 'src', 'main.tsx'), 'export {}', 'utf-8');
    writeFileSync(join(testDir, 'node_modules', 'pkg', 'index.js'), '', 'utf-8');
    writeFileSync(join(testDir, 'dist', 'bundle.js'), '', 'utf-8');
    writeFileSync(join(testDir, '.gitignore'), 'dist/\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('lists root entries when query is empty', () => {
    const results = searchFiles(testDir, '');
    const names = results.map((r) => r.relativePath);
    expect(names).toContain('apps');
    expect(names).not.toContain('node_modules');
  });

  it('fuzzy matches nested files', () => {
    const results = searchFiles(testDir, 'app.tsx');
    expect(results.some((r) => r.relativePath === 'apps/renderer/src/App.tsx')).toBe(true);
  });

  it('sorts directories before files', () => {
    const results = searchFiles(testDir, 'app');
    const firstDirIndex = results.findIndex((r) => r.isDirectory);
    const firstFileIndex = results.findIndex((r) => !r.isDirectory);
    if (firstDirIndex >= 0 && firstFileIndex >= 0) {
      expect(firstDirIndex).toBeLessThan(firstFileIndex);
    }
  });

  it('respects gitignore patterns', () => {
    const results = searchFiles(testDir, 'bundle');
    expect(results.some((r) => r.relativePath.startsWith('dist/'))).toBe(false);
  });
});
