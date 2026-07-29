/**
 * 读取并校验 task.json；definitionPath 记录源文件路径供 fixture 相对解析。
 * 同目录 metadata.yaml 可选加载。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isAgentRuntimeProfile, type EvaluationTask } from '@desktop-agent/shared';
import { loadTaskMetadata, type TaskMetadata } from './metadata.js';

export interface LoadedEvaluationTask extends EvaluationTask {
  definitionPath: string;
  metadata?: TaskMetadata;
}

/** schemaVersion、必填字段不合法时抛错，带文件路径 */
export async function loadTask(path: string): Promise<LoadedEvaluationTask> {
  const definitionPath = resolve(path);
  const value = JSON.parse(await readFile(definitionPath, 'utf8')) as Partial<EvaluationTask>;
  validateTask(value, definitionPath);
  const metadata = await loadTaskMetadata(definitionPath);
  return { ...value, definitionPath, metadata } as LoadedEvaluationTask;
}

function validateTask(task: Partial<EvaluationTask>, path: string): asserts task is EvaluationTask {
  const requiredText: Array<keyof EvaluationTask> = ['id', 'version', 'title', 'prompt', 'profile', 'fixture'];
  for (const field of requiredText) {
    if (typeof task[field] !== 'string' || !task[field]) throw new Error(`${path}: task.${field} must be a non-empty string.`);
  }
  if (typeof task.profile !== 'string' || !isAgentRuntimeProfile(task.profile)) {
    throw new Error(`${path}: task.profile must be a known AgentRuntimeProfile.`);
  }
  if (task.schemaVersion !== 1) throw new Error(`${path}: unsupported task schemaVersion.`);
  if (!Array.isArray(task.capabilities)) throw new Error(`${path}: task.capabilities must be an array.`);
  if (!task.verifier || typeof task.verifier !== 'object') throw new Error(`${path}: task.verifier is required.`);
  const maxAttempts = task.limits?.maxAttempts;
  if (maxAttempts !== undefined && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    throw new Error(`${path}: task.limits.maxAttempts must be a positive integer.`);
  }
}
