import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../checkers.js';
import { getTaskDirectory, loadTasks } from '../tasks.js';
import { copyWorkspace, resolveWithin } from '../workspace.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const tasksRoot = resolve(moduleDirectory, '..', 'tasks');

describe('seed coding task set', () => {
  it('loads the smoke and regression tasks with unique ids', async () => {
    const tasks = await loadTasks(tasksRoot);

    expect(tasks.map((task) => task.id)).toEqual([
      'coding-regression-001',
      'coding-regression-002',
      'coding-regression-003',
      'coding-smoke-001',
      'coding-smoke-002',
      'coding-smoke-003',
    ]);
  });

  it('starts every mutation task in a failing, diagnosable state', async () => {
    const tasks = await loadTasks(tasksRoot);

    for (const task of tasks) {
      const workspacePath = await mkdtemp(join(tmpdir(), `${task.id}-`));
      const taskDirectory = getTaskDirectory(task);
      const fixture = resolve(taskDirectory, task.workspace.fixture);
      await copyWorkspace(resolveWithin(tasksRoot, relative(tasksRoot, fixture)), workspacePath);

      const results = await runChecks(task.checks, { workspacePath, taskDirectory, tasksRoot });
      const verification = results.find((result) => result.type === 'command');

      expect(verification, task.id).toMatchObject({ passed: false });
    }
  });
});
