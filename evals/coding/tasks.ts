import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvalCheck, EvalTask, EvalSuite, LoadedEvalTask } from './task-schema.js';

const SUITES: EvalSuite[] = ['smoke', 'regression', 'quality'];

export async function loadTasks(tasksRoot: string): Promise<LoadedEvalTask[]> {
  const taskFiles = await Promise.all(SUITES.map(async (suite) => {
    const directory = join(tasksRoot, suite);
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(directory, entry.name));
  }));
  const tasks = await Promise.all(taskFiles.flat().map(readTask));
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
  }
  return tasks.sort((left, right) => left.id.localeCompare(right.id));
}

export async function readTask(definitionPath: string): Promise<LoadedEvalTask> {
  const raw: unknown = JSON.parse(await readFile(definitionPath, 'utf8'));
  validateTask(raw, definitionPath);
  return { ...raw, definitionPath };
}

export function selectTasks(tasks: LoadedEvalTask[], options: { suite?: EvalSuite; taskIds?: string[] }): LoadedEvalTask[] {
  const selected = tasks.filter((task) => {
    const suiteMatches = !options.suite || task.suite === options.suite;
    const idMatches = !options.taskIds?.length || options.taskIds.includes(task.id);
    return suiteMatches && idMatches;
  });
  if (selected.length === 0) {
    throw new Error('No tasks matched. Check --suite and --task values.');
  }
  return selected;
}

function validateTask(raw: unknown, definitionPath: string): asserts raw is EvalTask {
  if (!isObject(raw)) throw new Error(`${definitionPath}: task must be a JSON object.`);
  if (raw.schemaVersion !== 1) throw new Error(`${definitionPath}: schemaVersion must be 1.`);
  for (const key of ['id', 'title', 'prompt'] as const) {
    if (typeof raw[key] !== 'string' || raw[key].trim() === '') {
      throw new Error(`${definitionPath}: ${key} must be a non-empty string.`);
    }
  }
  if (!SUITES.includes(raw.suite as EvalSuite)) {
    throw new Error(`${definitionPath}: suite must be one of ${SUITES.join(', ')}.`);
  }
  if (!isObject(raw.workspace) || typeof raw.workspace.fixture !== 'string') {
    throw new Error(`${definitionPath}: workspace.fixture must be a string.`);
  }
  if (!Array.isArray(raw.checks) || raw.checks.length === 0) {
    throw new Error(`${definitionPath}: checks must be a non-empty array.`);
  }
  const ids = new Set<string>();
  for (const check of raw.checks) {
    validateCheck(check, definitionPath);
    if (ids.has(check.id)) throw new Error(`${definitionPath}: duplicate check id ${check.id}.`);
    ids.add(check.id);
  }
}

function validateCheck(check: unknown, definitionPath: string): asserts check is EvalCheck {
  if (!isObject(check) || typeof check.id !== 'string' || typeof check.type !== 'string') {
    throw new Error(`${definitionPath}: every check needs id and type.`);
  }
  if (check.weight !== undefined && (typeof check.weight !== 'number' || check.weight <= 0)) {
    throw new Error(`${definitionPath}: check ${check.id} has an invalid weight.`);
  }
  if (check.type === 'file-exists' && typeof check.path === 'string') return;
  if (check.type === 'file-contains' && typeof check.path === 'string' && isStringOrStrings(check.includes)) return;
  if (check.type === 'snapshot' && typeof check.path === 'string' && typeof check.expectedPath === 'string') return;
  if (check.type === 'command' && typeof check.command === 'string' && (check.args === undefined || isStringArray(check.args))) return;
  throw new Error(`${definitionPath}: check ${check.id} has invalid fields for ${check.type}.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringOrStrings(value: unknown): value is string | string[] {
  return typeof value === 'string' || isStringArray(value);
}

export function getTaskDirectory(task: LoadedEvalTask): string {
  return dirname(task.definitionPath);
}
