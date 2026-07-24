import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LoadedEvaluationTask } from '../src/task.js';
import { runTask, type AgentExecutor } from '../src/runner.js';
import { runProcess } from '../src/process.js';

describe('agent-eval runner', () => {
  it('uses verifier evidence instead of the agent completion claim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-'));
    const fixture = join(root, 'fixture');
    await writeFile(join(root, 'placeholder'), '', 'utf8');
    await (await import('node:fs/promises')).mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'answer.txt'), 'broken\n', 'utf8');
    const task = createTask(root);
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
