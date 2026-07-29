/** runTask 全流程与 verifier、子进程执行 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LoadedEvaluationTask } from '../src/task.js';
import { runTask, type AgentExecutor, shouldRetryAttempt, buildAttemptRetryFeedback } from '../src/runner.js';
import { runProcess } from '../src/process.js';

describe('agent-eval runner', () => {
  it('uses verifier evidence instead of the agent completion claim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await writeFile(join(root, 'placeholder'), '', 'utf8');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    const task = { ...createTask(root), limits: { maxAttempts: 1 } };
    const executor: AgentExecutor = { async execute() { return { text: '任务已完成', trace: [{ type: 'tool_result', payload: { content: 'raw result' } }] }; } };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('failed');
    expect(result.verifier.passed).toBe(false);
    expect(await readFile(result.artifacts.tracePath!, 'utf8')).toContain('raw result');
  });

  it('records a successful verification and preserves protected files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    await writeFile(join(fixture, 'protected.txt'), 'fixed\n', 'utf8');
    const task = createTask(root);
    const executor: AgentExecutor = {
      async execute(_task, workspacePath) {
        await writeFile(join(workspacePath, 'answer.txt'), 'fixed\n', 'utf8');
        return { text: 'done', trace: [] };
      },
    };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('passed');
    expect(result.verifier.checks.every((check) => check.passed)).toBe(true);
  });

  it('fails verification when an agent changes more files than the task allows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    const task = { ...createTask(root), limits: { maxChangedFiles: 1, maxAttempts: 1 } };
    const executor: AgentExecutor = {
      async execute(_task, workspacePath) {
        await writeFile(join(workspacePath, 'answer.txt'), 'fixed\n', 'utf8');
        await writeFile(join(workspacePath, 'extra.txt'), 'unexpected\n', 'utf8');
        return { text: 'done', trace: [] };
      },
    };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('failed');
    expect(result.verifier.checks).toContainEqual(expect.objectContaining({ id: 'changed-files-limit', passed: false }));
  });

  it('runs migrated declarative verifier checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    const task = {
      ...createTask(root),
      verifier: {
        requiredFiles: ['answer.txt'],
        checks: [{ id: 'answer-content', type: 'file-contains' as const, path: 'answer.txt', includes: 'fixed' }],
      },
    };
    const executor: AgentExecutor = {
      async execute(_task, workspacePath) {
        await writeFile(join(workspacePath, 'answer.txt'), 'fixed\n', 'utf8');
        return { text: 'done', trace: [] };
      },
    };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('passed');
    expect(result.verifier.checks).toContainEqual(expect.objectContaining({ id: 'answer-content', passed: true }));
  });

  it('continues a failed verification in the same workspace and session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    const task = {
      ...createTask(root),
      limits: { maxAttempts: 2 },
      verifier: { requiredFiles: ['answer.txt'], checks: [{ id: 'answer-content', type: 'file-contains' as const, path: 'answer.txt', includes: 'fixed' }] },
    };
    const calls: string[] = [];
    const executor: AgentExecutor = {
      async execute(_task, workspacePath, sessionId) {
        calls.push(`execute:${sessionId}:${workspacePath}`);
        return { text: 'first', trace: [] };
      },
      async continueExecution(_task, workspacePath, sessionId, feedback) {
        calls.push(`continue:${sessionId}:${workspacePath}`);
        expect(feedback).toContain('answer-content');
        await writeFile(join(workspacePath, 'answer.txt'), 'fixed\n', 'utf8');
        return { text: 'fixed', trace: [] };
      },
      async close(sessionId) {
        calls.push(`close:${sessionId}`);
      },
    };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('passed');
    expect(result.attemptCount).toBe(2);
    expect(result.attempts?.map((attempt) => attempt.status)).toEqual(['failed', 'passed']);
    expect(calls[0].split(':')[1]).toBe(calls[1].split(':')[1]);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatch(/^close:/);
  });

  it('does not consume eval attempts on transient API errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    await writeFile(join(fixture, 'protected.txt'), 'fixed\n', 'utf8');
    const task = { ...createTask(root), limits: { maxAttempts: 3 } };
    const executor: AgentExecutor = {
      async execute() {
        return { text: 'oops', trace: [], error: 'OpenAI API error: 500 Internal Server Error' };
      },
      async close() {},
    };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('error');
    expect(result.attemptCount).toBe(1);
  });

  it('retries after max_turns exhaustion with focused feedback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    await writeFile(join(fixture, 'protected.txt'), 'fixed\n', 'utf8');
    const task = { ...createTask(root), limits: { maxAttempts: 2 } };
    const executor: AgentExecutor = {
      async execute() {
        return { text: 'incomplete', trace: [], error: 'Agent execution failed (error_max_turns).' };
      },
      async continueExecution(_task, workspacePath, _sessionId, feedback) {
        expect(feedback).toContain('ran out of turns');
        await writeFile(join(workspacePath, 'answer.txt'), 'fixed\n', 'utf8');
        return { text: 'fixed', trace: [] };
      },
      async close() {},
    };

    const result = await runTask(task, { outputRoot: join(root, 'runs'), executor, model: { model: 'mock' } });

    expect(result.status).toBe('passed');
    expect(result.attemptCount).toBe(2);
  });

  it('includes harness stderr details in retry feedback', () => {
    const feedback = buildAttemptRetryFeedback(1, 3, {
      index: 1,
      status: 'failed',
      startedAt: 't0',
      endedAt: 't1',
      durationMs: 1,
      verifier: {
        passed: false,
        checks: [{
          id: 'command:node',
          passed: false,
          evidence: 'node verify.mjs exited 1 (expected 0); missing stdout: DWB_VERIFY_PASS; stderr: DWB_VERIFY_FAIL: slide count 0',
          durationMs: 1,
        }],
      },
    });

    expect(feedback).toContain('Harness stderr');
    expect(feedback).toContain('DWB_VERIFY_FAIL: slide count 0');
  });
});

describe('retry helpers', () => {
  it('retries verifier failures, max_turns, and timeouts only', () => {
    expect(shouldRetryAttempt('failed')).toBe(true);
    expect(shouldRetryAttempt('timeout')).toBe(true);
    expect(shouldRetryAttempt('error', 'Agent execution failed (error_max_turns).')).toBe(true);
    expect(shouldRetryAttempt('error', 'OpenAI API error: 500 Internal Server Error')).toBe(false);
    expect(shouldRetryAttempt('passed')).toBe(false);
    expect(shouldRetryAttempt('error')).toBe(false);
  });
});

describe('process execution', () => {
  it('runs a Node command without a shell', async () => {
    const result = await runProcess(process.execPath, ['-e', 'console.log("ok")'], process.cwd());
    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.stdout).toContain('ok');
  });
});

function createTask(root: string): LoadedEvaluationTask {
  return {
    schemaVersion: 1,
    id: 'test-task',
    version: '1',
    title: 'test',
    prompt: 'fix it',
    profile: 'coding',
    capabilities: ['edit-code'],
    fixture: 'fixture',
    verifier: { requiredFiles: ['answer.txt'], unchangedPaths: ['protected.txt'] },
    definitionPath: join(root, 'task.json'),
  };
}
