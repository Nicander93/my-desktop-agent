import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoadedEvaluationTask } from './task.js';
import { loadTask } from './task.js';

export async function loadTaskCollection(root: string, options: { suite?: string; taskIds?: string[] } = {}): Promise<LoadedEvaluationTask[]> {
  const taskPaths = await findTaskPaths(root);
  const tasks = await Promise.all(taskPaths.map(loadTask));
  const selected = tasks.filter((task) =>
    (!options.suite || task.suite === options.suite) &&
    (!options.taskIds?.length || options.taskIds.includes(task.id)),
  );
  if (selected.length === 0) throw new Error('No evaluation tasks matched the selection.');
  return selected.sort((left, right) => left.id.localeCompare(right.id));
}

async function findTaskPaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => findTaskPaths(join(directory, entry.name))));
  return [
    ...entries.filter((entry) => entry.isFile() && entry.name === 'task.json').map((entry) => join(directory, entry.name)),
    ...nested.flat(),
  ];
}
