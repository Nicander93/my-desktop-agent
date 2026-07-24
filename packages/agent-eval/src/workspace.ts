import { cp, readdir, readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function prepareWorkspace(fixturePath: string, baselinePath: string, workspacePath: string): Promise<void> {
  await mkdir(baselinePath, { recursive: true });
  await mkdir(workspacePath, { recursive: true });
  await cp(fixturePath, baselinePath, { recursive: true, force: true });
  await cp(fixturePath, workspacePath, { recursive: true, force: true });
}

export async function writeDiff(before: string, after: string, destination: string): Promise<void> {
  const beforeFiles = await listFiles(before);
  const afterFiles = await listFiles(after);
  const paths = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].sort();
  const entries: string[] = [];
  for (const path of paths) {
    const oldValue = beforeFiles.get(path);
    const newValue = afterFiles.get(path);
    if (oldValue === newValue) continue;
    entries.push(`--- a/${path}\n+++ b/${path}\n@@\n-${oldValue ?? ''}\n+${newValue ?? ''}`);
  }
  await writeFile(destination, `${entries.join('\n')}\n`, 'utf8');
}

async function listFiles(root: string, current = root, result = new Map<string, string>()): Promise<Map<string, string>> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await listFiles(root, path, result);
    else if (entry.isFile() && (await stat(path)).size <= 1_000_000) result.set(relative(root, path).replace(/\\/g, '/'), await readFile(path, 'utf8').catch(() => '<binary>'));
  }
  return result;
}
