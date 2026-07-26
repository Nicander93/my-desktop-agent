/**
 * 递归扫描 benchmarks 下的 task.json，按 suite / taskId / tag / domain / difficulty 筛选。
 * 无匹配时抛错，避免空跑。单任务 metadata 非法时跳过并记入错误，不拖垮整批。
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoadedEvaluationTask } from './task.js';
import { loadTask } from './task.js';

export interface TaskCollectionOptions {
  suite?: string;
  taskIds?: string[];
  tag?: string;
  domain?: string;
  difficulty?: string;
}

/** 返回按 id 排序的已加载 task 列表 */
export async function loadTaskCollection(root: string, options: TaskCollectionOptions = {}): Promise<LoadedEvaluationTask[]> {
  const taskPaths = await findTaskPaths(root);
  const tasks: LoadedEvaluationTask[] = [];
  const errors: string[] = [];
  for (const path of taskPaths) {
    try {
      tasks.push(await loadTask(path));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const selected = tasks.filter((task) =>
    (!options.suite || task.suite === options.suite)
    && (!options.taskIds?.length || options.taskIds.includes(task.id))
    && (!options.tag || (task.tags ?? []).includes(options.tag))
    && (!options.domain || task.metadata?.domain === options.domain)
    && (!options.difficulty || task.metadata?.difficulty?.level === options.difficulty),
  );
  if (selected.length === 0) {
    const detail = errors.length > 0 ? ` Load errors:\n${errors.join('\n')}` : '';
    throw new Error(`No evaluation tasks matched the selection.${detail}`);
  }
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
