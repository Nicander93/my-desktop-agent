import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { EvaluationCheck, EvaluationTask, EvaluationVerification } from '@desktop-agent/shared';
import { runProcess } from './process.js';

export async function verifyTask(task: EvaluationTask, workspacePath: string, baselinePath: string): Promise<EvaluationVerification> {
  const checks: EvaluationCheck[] = [];
  for (const path of task.verifier.requiredFiles ?? []) checks.push(await requiredFileCheck(path, workspacePath));
  for (const path of task.verifier.unchangedPaths ?? []) checks.push(await unchangedFileCheck(path, workspacePath, baselinePath));
  for (const command of task.verifier.commands ?? []) checks.push(await commandCheck(command, workspacePath));
  return { passed: checks.every((check) => check.passed), checks };
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

async function unchangedFileCheck(path: string, workspacePath: string, baselinePath: string): Promise<EvaluationCheck> {
  const started = performance.now();
  try {
    const [current, baseline] = await Promise.all([
      readFile(resolveInside(workspacePath, path)),
      readFile(resolveInside(baselinePath, path)),
    ]);
    return result(`unchanged:${path}`, current.equals(baseline), current.equals(baseline) ? `Protected file unchanged: ${path}` : `Protected file changed: ${path}`, started);
  } catch (error) {
    return result(`unchanged:${path}`, false, error instanceof Error ? error.message : String(error), started);
  }
}

async function commandCheck(command: NonNullable<EvaluationTask['verifier']['commands']>[number], workspacePath: string): Promise<EvaluationCheck> {
  const started = performance.now();
  try {
    const args = isolatedCommandArgs(command.command, command.args ?? []);
    const output = await runProcess(command.command, args, workspacePath, command.timeoutMs);
    const expected = command.expectedExitCode ?? 0;
    const passed = !output.timedOut && output.exitCode === expected;
    return result(`command:${command.command}`, passed, `${command.command} ${args.join(' ')} exited ${output.exitCode ?? 'none'} (expected ${expected})${output.timedOut ? '; timed out' : ''}${output.stderr ? `; stderr: ${output.stderr.slice(-500)}` : ''}`, started);
  } catch (error) {
    return result(`command:${command.command}`, false, error instanceof Error ? error.message : String(error), started);
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
