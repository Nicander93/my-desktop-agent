import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { relative, resolve } from 'node:path';
import type { EvalCheck, CheckResult, Outcome } from './task-schema.js';
import { resolveWithin } from './workspace.js';

const MAX_COMMAND_OUTPUT = 50_000;

export interface CheckerContext {
  workspacePath: string;
  taskDirectory: string;
  /** The task collection root; expected fixtures may be shared by suites. */
  tasksRoot: string;
}

export async function runChecks(checks: EvalCheck[], context: CheckerContext): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    results.push(await runCheck(check, context));
  }
  return results;
}

export async function runCheck(check: EvalCheck, context: CheckerContext): Promise<CheckResult> {
  const started = performance.now();
  const makeResult = (passed: boolean, evidence: string[]): CheckResult => ({
    id: check.id,
    type: check.type,
    description: check.description,
    passed,
    weight: check.weight ?? 1,
    evidence,
    durationMs: Math.round(performance.now() - started),
  });

  try {
    switch (check.type) {
      case 'file-exists': {
        const path = resolveWithin(context.workspacePath, check.path);
        const content = await readFile(path).then(() => true).catch(() => false);
        return makeResult(content, [content ? `File exists: ${check.path}` : `File is missing: ${check.path}`]);
      }
      case 'file-contains': {
        const content = await readFile(resolveWithin(context.workspacePath, check.path), 'utf8');
        const terms = Array.isArray(check.includes) ? check.includes : [check.includes];
        const found = terms.filter((term) => content.includes(term));
        const passed = (check.match ?? 'all') === 'all' ? found.length === terms.length : found.length > 0;
        return makeResult(passed, [
          `File: ${check.path}`,
          `Matched ${found.length}/${terms.length}: ${found.join(', ') || '(none)'}`,
        ]);
      }
      case 'snapshot': {
        const actual = await readFile(resolveWithin(context.workspacePath, check.path), 'utf8');
        const expected = await readFile(resolveTaskPath(context, check.expectedPath), 'utf8');
        const passed = normalizeText(actual) === normalizeText(expected);
        return makeResult(passed, passed
          ? [`Snapshot matches: ${check.path}`]
          : [`Snapshot differs: ${check.path}`, `Expected fixture: ${check.expectedPath}`]);
      }
      case 'command': {
        const output = await runCommand(check.command, check.args ?? [], context.workspacePath, check.timeoutMs);
        const expectedExitCode = check.expectedExitCode ?? 0;
        const includes = check.stdoutIncludes === undefined
          ? []
          : (Array.isArray(check.stdoutIncludes) ? check.stdoutIncludes : [check.stdoutIncludes]);
        const missing = includes.filter((needle) => !output.stdout.includes(needle));
        const passed = !output.timedOut && output.exitCode === expectedExitCode && missing.length === 0;
        return {
          ...makeResult(passed, [
          `Command: ${[check.command, ...(check.args ?? [])].join(' ')}`,
          `Exit code: ${output.exitCode ?? 'none'} (expected ${expectedExitCode})`,
          ...(output.timedOut ? [`Timed out after ${check.timeoutMs ?? 60_000}ms`] : []),
          ...(missing.length > 0 ? [`Missing stdout text: ${missing.join(', ')}`] : []),
          ...(output.stderr ? [`stderr: ${truncate(output.stderr)}`] : []),
          ]),
          commandOutput: output,
        };
      }
    }
  } catch (error) {
    return makeResult(false, [error instanceof Error ? error.message : String(error)]);
  }
}

export function calculateOutcome(checks: CheckResult[]): Outcome {
  const maxScore = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = checks.filter((check) => check.passed).reduce((sum, check) => sum + check.weight, 0);
  return {
    passed: checks.every((check) => check.passed),
    score,
    maxScore,
    percentage: maxScore === 0 ? 100 : Math.round((score / maxScore) * 10_000) / 100,
  };
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const append = (current: string, chunk: Buffer) => `${current}${chunk.toString()}`.slice(-MAX_COMMAND_OUTPUT);
    const finish = (value: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on('error', (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      reject(error);
    });
    child.on('close', (exitCode) => finish({ exitCode, stdout, stderr, timedOut }));
  });
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true });
    killer.on('error', () => undefined);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The command may have exited between the timeout and termination.
  }
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function resolveTaskPath(context: CheckerContext, candidate: string): string {
  const intended = resolve(context.taskDirectory, candidate);
  return resolveWithin(context.tasksRoot, relative(context.tasksRoot, intended));
}

function truncate(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}…` : value;
}
