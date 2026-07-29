/** metadata.yaml 加载、缺省与非法值 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTask } from '../src/task.js';
import { loadTaskMetadata } from '../src/metadata.js';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('task metadata', () => {
  it('loads optional metadata for DWB tasks', async () => {
    const task = await loadTask(join(repositoryRoot, 'benchmarks/tasks/DP-001/task.json'));
    expect(task.metadata?.benchmark).toBe('dwb');
    expect(task.metadata?.domain).toBe('data-processing');
    expect(task.metadata?.difficulty?.level).toBe('D2');
  });

  it('keeps legacy tasks runnable without metadata', async () => {
    const task = await loadTask(join(repositoryRoot, 'benchmarks/tasks/coding-bugfix-basic/task.json'));
    expect(task.metadata).toBeUndefined();
    expect(task.id).toBe('coding-bugfix-basic');
  });

  it('rejects invalid difficulty levels', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dwb-meta-'));
    try {
      await writeFile(join(dir, 'metadata.yaml'), 'benchmark: dwb\ndifficulty:\n  level: D9\n', 'utf8');
      await expect(loadTaskMetadata(join(dir, 'task.json'))).rejects.toThrow(/D0\|D1\|D2\|D3/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
