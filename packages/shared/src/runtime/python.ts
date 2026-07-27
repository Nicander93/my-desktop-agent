import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_PYTHON_VERSION = '3.12';

export interface PythonRuntimeRecord {
  version: string;
  pythonExe: string;
  shimsDir: string;
}

export function getPythonRuntimeRecordPath(storeRoot: string): string {
  return join(storeRoot, 'python', 'runtime.json');
}

export function getPythonShimsDir(storeRoot: string): string {
  return join(storeRoot, 'shims');
}

export function readPythonRuntimeRecord(storeRoot: string): PythonRuntimeRecord | undefined {
  const recordPath = getPythonRuntimeRecordPath(storeRoot);
  if (!existsSync(recordPath)) return undefined;

  try {
    const record = JSON.parse(readFileSync(recordPath, 'utf-8')) as PythonRuntimeRecord;
    if (!record.pythonExe || !existsSync(record.pythonExe)) return undefined;
    return record;
  } catch {
    return undefined;
  }
}

export function getPythonPathSegments(storeRoot: string): string[] {
  const record = readPythonRuntimeRecord(storeRoot);
  if (!record) return [];

  const segments = [record.shimsDir, dirname(record.pythonExe)];
  return [...new Set(segments)];
}
