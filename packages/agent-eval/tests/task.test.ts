import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTask } from '../src/task.js';

describe('coding-bugfix-basic task', () => {
  it('explicitly declares the task execution contract and protected tests', async () => {
    const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const task = await loadTask(resolve(packageDirectory, '../../benchmarks/tasks/coding-bugfix-basic/task.json'));

    expect(task).toMatchObject({
      id: 'coding-bugfix-basic',
      profile: 'coding',
      capabilities: ['read-project', 'edit-code', 'run-tests', 'inspect-git-diff'],
      workflowId: 'coding-change-verify',
    });
    expect(task.verifier.unchangedPaths).toContain('test/filter.test.js');
    expect(task.verifier.commands).toHaveLength(2);
  });

  it('keeps all PR 4 task policies explicit and verifier-driven', async () => {
    const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const tasks = await Promise.all(['coding-mario-web', 'office-ai-ppt', 'office-excel-report'].map((id) => loadTask(resolve(packageDirectory, `../../benchmarks/tasks/${id}/task.json`))));
    expect(tasks.map((task) => task.profile)).toEqual(['coding', 'office', 'office']);
    expect(tasks.every((task) => task.capabilities.length > 0 && task.verifier.commands?.length)).toBe(true);
  });
});
