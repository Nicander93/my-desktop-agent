import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

const COPY_EXCLUDES = new Set(['.git', 'node_modules', 'dist', 'runs']);

export function resolveWithin(root: string, candidate: string): string {
  if (isAbsolute(candidate)) {
    throw new Error(`Expected a relative path, received "${candidate}".`);
  }
  const resolved = resolve(root, candidate);
  const pathFromRoot = relative(root, resolved);
  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error(`Path escapes its allowed root: "${candidate}".`);
  }
  return resolved;
}

export async function copyWorkspace(source: string, destination: string): Promise<void> {
  const sourceInfo = await stat(source).catch(() => undefined);
  if (!sourceInfo?.isDirectory()) {
    throw new Error(`Workspace fixture does not exist or is not a directory: ${source}`);
  }
  await mkdir(destination, { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (path) => !COPY_EXCLUDES.has(basename(path)),
  });
}

export interface FileState {
  hash: string;
  size: number;
}

export async function snapshotDirectory(root: string): Promise<Map<string, FileState>> {
  const files = new Map<string, FileState>();
  await visit(root, root, files);
  return files;
}

async function visit(root: string, current: string, files: Map<string, FileState>): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (COPY_EXCLUDES.has(entry.name)) continue;
    const fullPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      await visit(root, fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const content = await readFile(fullPath);
    files.set(relative(root, fullPath).split(sep).join('/'), {
      hash: createHash('sha256').update(content).digest('hex'),
      size: content.byteLength,
    });
  }
}

export function findChangedFiles(before: Map<string, FileState>, after: Map<string, FileState>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path)?.hash !== after.get(path)?.hash)
    .sort((left, right) => left.localeCompare(right));
}
