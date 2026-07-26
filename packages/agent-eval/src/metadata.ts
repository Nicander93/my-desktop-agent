/**
 * 旁路加载任务目录 metadata.yaml；缺省不影响旧任务。
 */
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface DwbDifficulty {
  level: 'D0' | 'D1' | 'D2' | 'D3';
  planningDepth?: number;
  toolDiversity?: number;
  stateDependency?: number;
  inputAmbiguity?: number;
  verificationDifficulty?: number;
  recoveryDemand?: number;
}

export interface TaskMetadata {
  benchmark?: string;
  domain?: string;
  difficulty?: DwbDifficulty;
  frequency?: string;
  risk?: string;
  sourceType?: string;
  expectedArtifacts?: string[];
  diagnostics?: string[];
}

const DIFFICULTY_LEVELS = new Set(['D0', 'D1', 'D2', 'D3']);

export async function loadTaskMetadata(taskDefinitionPath: string): Promise<TaskMetadata | undefined> {
  const path = join(dirname(taskDefinitionPath), 'metadata.yaml');
  try {
    await access(path, constants.F_OK);
  } catch {
    return undefined;
  }
  const raw = parseYaml(await readFile(path, 'utf8')) as unknown;
  return validateMetadata(raw, path);
}

function validateMetadata(value: unknown, path: string): TaskMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path}: metadata must be a YAML object.`);
  }
  const meta = value as Record<string, unknown>;
  const result: TaskMetadata = {};
  if (meta.benchmark !== undefined) {
    if (typeof meta.benchmark !== 'string' || !meta.benchmark) throw new Error(`${path}: metadata.benchmark must be a non-empty string.`);
    result.benchmark = meta.benchmark;
  }
  if (meta.domain !== undefined) {
    if (typeof meta.domain !== 'string' || !meta.domain) throw new Error(`${path}: metadata.domain must be a non-empty string.`);
    result.domain = meta.domain;
  }
  if (meta.difficulty !== undefined) {
    if (!meta.difficulty || typeof meta.difficulty !== 'object' || Array.isArray(meta.difficulty)) {
      throw new Error(`${path}: metadata.difficulty must be an object.`);
    }
    const difficulty = meta.difficulty as Record<string, unknown>;
    if (typeof difficulty.level !== 'string' || !DIFFICULTY_LEVELS.has(difficulty.level)) {
      throw new Error(`${path}: metadata.difficulty.level must be one of D0|D1|D2|D3.`);
    }
    result.difficulty = { level: difficulty.level as DwbDifficulty['level'] };
    for (const key of ['planningDepth', 'toolDiversity', 'stateDependency', 'inputAmbiguity', 'verificationDifficulty', 'recoveryDemand'] as const) {
      if (difficulty[key] !== undefined) {
        if (typeof difficulty[key] !== 'number') throw new Error(`${path}: metadata.difficulty.${key} must be a number.`);
        result.difficulty[key] = difficulty[key] as number;
      }
    }
  }
  for (const key of ['frequency', 'risk', 'sourceType'] as const) {
    if (meta[key] !== undefined) {
      if (typeof meta[key] !== 'string') throw new Error(`${path}: metadata.${key} must be a string.`);
      result[key] = meta[key] as string;
    }
  }
  for (const key of ['expectedArtifacts', 'diagnostics'] as const) {
    if (meta[key] !== undefined) {
      if (!Array.isArray(meta[key]) || !(meta[key] as unknown[]).every((item) => typeof item === 'string')) {
        throw new Error(`${path}: metadata.${key} must be a string array.`);
      }
      result[key] = meta[key] as string[];
    }
  }
  return result;
}

export function resolveHiddenFixtureRoot(taskDefinitionPath: string, taskId: string): string {
  return join(dirname(taskDefinitionPath), '..', '..', 'hidden-fixtures', taskId);
}
