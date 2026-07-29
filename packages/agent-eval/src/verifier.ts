/**
 * Verifier：必存文件 → 保护文件/目录未改 → 命令 → 声明式 checks。
 * 若存在 hidden-fixtures/<taskId>，命令执行前注入 DWB_HIDDEN_ROOT（不进 workspace）。
 * 路径都走 resolveInside，不许逃出 workspace。
 */
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { EvaluationCheck, EvaluationTask, EvaluationVerification } from '@desktop-agent/shared';
import { resolveHiddenFixtureRoot } from './metadata.js';
import { runProcess } from './process.js';

export async function verifyTask(task: EvaluationTask, workspacePath: string, baselinePath: string): Promise<EvaluationVerification> {
  const checks: EvaluationCheck[] = [];
  const definitionPath = (task as EvaluationTask & { definitionPath?: string }).definitionPath;
  const taskDir = definitionPath ? dirname(definitionPath) : undefined;
  const previousHidden = process.env.DWB_HIDDEN_ROOT;
  if (definitionPath) {
    const hiddenRoot = resolveHiddenFixtureRoot(definitionPath, task.id);
    try {
      await access(hiddenRoot, constants.F_OK);
      process.env.DWB_HIDDEN_ROOT = hiddenRoot;
    } catch {
      delete process.env.DWB_HIDDEN_ROOT;
    }
  }
  try {
    for (const path of task.verifier.requiredFiles ?? []) checks.push(await requiredFileCheck(path, workspacePath));
    for (const path of task.verifier.unchangedPaths ?? []) checks.push(await unchangedFileCheck(path, workspacePath, baselinePath));
    for (const command of task.verifier.commands ?? []) checks.push(await commandCheck(command, workspacePath, taskDir));
    for (const check of task.verifier.checks ?? []) checks.push(await declarativeCheck(check, task, workspacePath));
    return { passed: checks.every((check) => check.passed), checks };
  } finally {
    if (previousHidden === undefined) delete process.env.DWB_HIDDEN_ROOT;
    else process.env.DWB_HIDDEN_ROOT = previousHidden;
  }
}

async function requiredFileCheck(path: string, workspacePath: string): Promise<EvaluationCheck> {
  const started = performance.now();
  try {
    await access(resolveInside(workspacePath, path), constants.F_OK);
    return result(`file:${path}`, true, `Required file exists: ${path}`, started);
  } catch {
    return result(`file:${path}`, false, `Required file is missing: ${path}`, started);
  }
}

/** 和 baseline 比：文件比字节；目录递归比相对路径与内容 */
async function unchangedFileCheck(path: string, workspacePath: string, baselinePath: string): Promise<EvaluationCheck> {
  const started = performance.now();
  try {
    const currentPath = resolveInside(workspacePath, path);
    const baselineResolved = resolveInside(baselinePath, path);
    const [currentStat, baselineStat] = await Promise.all([stat(currentPath), stat(baselineResolved)]);
    if (currentStat.isDirectory() || baselineStat.isDirectory()) {
      if (!currentStat.isDirectory() || !baselineStat.isDirectory()) {
        return result(`unchanged:${path}`, false, `Protected path type mismatch (file vs directory): ${path}`, started);
      }
      const diff = await diffDirectories(currentPath, baselineResolved);
      return result(
        `unchanged:${path}`,
        diff === undefined,
        diff === undefined ? `Protected directory unchanged: ${path}` : `Protected directory changed: ${path} (${diff})`,
        started,
      );
    }
    const [current, baseline] = await Promise.all([readFile(currentPath), readFile(baselineResolved)]);
    return result(`unchanged:${path}`, current.equals(baseline), current.equals(baseline) ? `Protected file unchanged: ${path}` : `Protected file changed: ${path}`, started);
  } catch (error) {
    return result(`unchanged:${path}`, false, error instanceof Error ? error.message : String(error), started);
  }
}

async function diffDirectories(currentRoot: string, baselineRoot: string): Promise<string | undefined> {
  const [currentFiles, baselineFiles] = await Promise.all([
    listRelativeFiles(currentRoot),
    listRelativeFiles(baselineRoot),
  ]);
  const currentSet = new Set(currentFiles);
  const baselineSet = new Set(baselineFiles);
  for (const file of baselineFiles) {
    if (!currentSet.has(file)) return `missing ${file}`;
  }
  for (const file of currentFiles) {
    if (!baselineSet.has(file)) return `extra ${file}`;
  }
  for (const file of baselineFiles) {
    const [a, b] = await Promise.all([
      readFile(join(currentRoot, file)),
      readFile(join(baselineRoot, file)),
    ]);
    if (!a.equals(b)) return `modified ${file}`;
  }
  return undefined;
}

async function listRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
      else if (entry.isFile()) files.push(rel.replace(/\\/g, '/'));
    }
  }
  await walk(root, '');
  return files.sort();
}

/** pnpm 自动加 --ignore-workspace；resolveArgsFromTaskDir 把相对 args 锚到 task 目录 */
async function commandCheck(
  command: NonNullable<EvaluationTask['verifier']['commands']>[number],
  workspacePath: string,
  taskDir?: string,
): Promise<EvaluationCheck> {
  const started = performance.now();
  try {
    const rawArgs = resolveCommandArgs(command, taskDir);
    const args = isolatedCommandArgs(command.command, rawArgs);
    const output = await runProcess(command.command, args, workspacePath, command.timeoutMs);
    const expected = command.expectedExitCode ?? 0;
    const requiredOutput = command.stdoutIncludes === undefined ? [] : (Array.isArray(command.stdoutIncludes) ? command.stdoutIncludes : [command.stdoutIncludes]);
    const missingOutput = requiredOutput.filter((value) => !output.stdout.includes(value));
    const passed = !output.timedOut && output.exitCode === expected && missingOutput.length === 0;
    return result(`command:${command.command}`, passed, `${command.command} ${args.join(' ')} exited ${output.exitCode ?? 'none'} (expected ${expected})${missingOutput.length > 0 ? `; missing stdout: ${missingOutput.join(', ')}` : ''}${output.timedOut ? '; timed out' : ''}${output.stderr ? `; stderr: ${output.stderr.slice(-500)}` : ''}`, started);
  } catch (error) {
    return result(`command:${command.command}`, false, error instanceof Error ? error.message : String(error), started);
  }
}

function resolveCommandArgs(
  command: NonNullable<EvaluationTask['verifier']['commands']>[number],
  taskDir?: string,
): string[] {
  const args = command.args ?? [];
  if (!command.resolveArgsFromTaskDir) return args;
  if (!taskDir) throw new Error('resolveArgsFromTaskDir requires task.definitionPath');
  return args.map((arg) => {
    if (!arg || arg.startsWith('-') || /^[A-Za-z]:[\\/]/.test(arg) || arg.startsWith('/')) return arg;
    return resolve(taskDir, arg);
  });
}

async function declarativeCheck(check: NonNullable<EvaluationTask['verifier']['checks']>[number], task: EvaluationTask, workspacePath: string): Promise<EvaluationCheck> {
  const started = performance.now();
  try {
    if (check.type === 'file-exists') {
      await access(resolveInside(workspacePath, check.path), constants.F_OK);
      return result(check.id, true, `File exists: ${check.path}`, started);
    }
    if (check.type === 'file-contains') {
      const content = await readFile(resolveInside(workspacePath, check.path), 'utf8');
      const expected = Array.isArray(check.includes) ? check.includes : [check.includes];
      const found = expected.filter((value) => content.includes(value));
      const passed = (check.match ?? 'all') === 'all' ? found.length === expected.length : found.length > 0;
      return result(check.id, passed, `Matched ${found.length}/${expected.length} required strings in ${check.path}`, started);
    }
    const definitionPath = (task as EvaluationTask & { definitionPath?: string }).definitionPath;
    if (!definitionPath) throw new Error(`Snapshot check ${check.id} requires a loaded task definition.`);
    const actual = await readFile(resolveInside(workspacePath, check.path), 'utf8');
    const expected = await readFile(resolveInside(dirname(definitionPath), check.expectedPath), 'utf8');
    const passed = normalizeText(actual) === normalizeText(expected);
    return result(check.id, passed, passed ? `Snapshot matches: ${check.path}` : `Snapshot differs: ${check.path}`, started);
  } catch (error) {
    return result(check.id, false, error instanceof Error ? error.message : String(error), started);
  }
}

function isolatedCommandArgs(command: string, args: string[]): string[] {
  if (command !== 'pnpm' || args.includes('--ignore-workspace')) return args;
  return ['--ignore-workspace', ...args];
}

function result(id: string, passed: boolean, evidence: string, started: number): EvaluationCheck {
  return { id, passed, evidence, durationMs: Math.round(performance.now() - started) };
}

function resolveInside(root: string, candidate: string): string {
  const target = resolve(root, candidate);
  if (relative(root, target).startsWith('..')) throw new Error(`Verifier path escapes workspace: ${candidate}`);
  return target;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n');
}
