import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EvaluationTask } from '@desktop-agent/shared';

export interface LoadedEvaluationTask extends EvaluationTask {
  definitionPath: string;
}

export async function loadTask(path: string): Promise<LoadedEvaluationTask> {
  const definitionPath = resolve(path);
  const value = JSON.parse(await readFile(definitionPath, 'utf8')) as Partial<EvaluationTask>;
  validateTask(value, definitionPath);
  return { ...value, definitionPath } as LoadedEvaluationTask;
}

function validateTask(task: Partial<EvaluationTask>, path: string): asserts task is EvaluationTask {
  const requiredText: Array<keyof EvaluationTask> = ['id', 'version', 'title', 'prompt', 'profile', 'fixture'];
  for (const field of requiredText) {
    if (typeof task[field] !== 'string' || !task[field]) throw new Error(`${path}: task.${field} must be a non-empty string.`);
  }
  if (task.schemaVersion !== 1) throw new Error(`${path}: unsupported task schemaVersion.`);
  if (!Array.isArray(task.capabilities)) throw new Error(`${path}: task.capabilities must be an array.`);
  if (!task.verifier || typeof task.verifier !== 'object') throw new Error(`${path}: task.verifier is required.`);
}
