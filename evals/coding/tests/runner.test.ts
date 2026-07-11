import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../checkers.js';
import { runTask, type AgentExecutor } from '../runner.js';
import type { EvalModelPreset } from '../model-presets.js';
import type { LoadedEvalTask } from '../task-schema.js';

const model: EvalModelPreset = {
  id: 'test',
  provider: 'test',
  apiType: 'openai-completions',
  apiKeyEnv: 'TEST_KEY',
  model: 'test-model',
  suites: ['smoke'],
};

describe('evaluation runner', () => {
  it('creates isolated artifacts, preserves trace and scores deterministic checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-eval-'));
    const task = await createTask(root);
    const executor: AgentExecutor = {
      async execute({ workspacePath }) {
        await writeFile(join(workspacePath, 'src', 'greet.js'), 'export const greet = () => "hello";\n', 'utf8');
        return {
          text: 'done',
          traceSpans: [
            { type: 'run_start' },
            { type: 'turn_start' },
            { type: 'tool_call' },
            { type: 'run_end', payload: { usage: { input_tokens: 12, output_tokens: 5 } } },
          ],
        };
      },
    };

    const result = await runTask({ task, runDirectory: join(root, 'runs', 'run-1'), model, executor });

    expect(result.status).toBe('pass');
    expect(result.outcome.percentage).toBe(100);
    expect(result.metrics).toMatchObject({ spans: 4, turns: 1, toolCalls: 1, changedFiles: 1, inputTokens: 12 });
    expect(result.changedFiles).toEqual(['src/greet.js']);
    expect(await readFile(result.artifacts.traceJsonlPath!, 'utf8')).toContain('tool_call');
    expect(await readFile(result.artifacts.diffPath, 'utf8')).toContain('greet.js');
    expect(await readFile(result.artifacts.reportPath, 'utf8')).toContain('Outcome: **100%**');
  });

  it('records failed command checks without masking the outcome score', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-eval-'));
    const task = await createTask(root, true);
    const executor: AgentExecutor = { async execute() { return { text: 'done', traceSpans: [{ type: 'run_start' }] }; } };

    const result = await runTask({ task, runDirectory: join(root, 'runs', 'run-2'), model, executor });

    expect(result.status).toBe('fail');
    expect(result.outcome.percentage).toBeLessThan(100);
    expect(result.failure?.phase).toBe('validation');
  });

  it('rejects a checker path that escapes the isolated workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-eval-'));
    const workspace = join(root, 'workspace');
    await mkdir(workspace, { recursive: true });

    const [result] = await runChecks([
      { id: 'escape', type: 'file-exists', path: '../outside.txt' },
    ], { workspacePath: workspace, taskDirectory: root, tasksRoot: root });

    expect(result).toMatchObject({ passed: false });
    expect(result.evidence.join(' ')).toContain('escapes its allowed root');
  });

  it('waits for cancellation before snapshotting a timed-out workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-eval-'));
    const task = await createTask(root);
    task.limits = { ...task.limits, timeoutMs: 10 };
    let releaseExecution: (() => void) | undefined;
    const executor: AgentExecutor = {
      execute: () => new Promise((resolve) => {
        releaseExecution = () => resolve({ text: 'cancelled', traceSpans: [] });
      }),
      async cancel() {
        await writeFile(join(root, 'cancel-finished'), 'yes', 'utf8');
        releaseExecution?.();
      },
    };

    const result = await runTask({ task, runDirectory: join(root, 'runs', 'timeout'), model, executor });

    expect(result.status).toBe('timeout');
    expect(await readFile(join(root, 'cancel-finished'), 'utf8')).toBe('yes');
  });
});

async function createTask(root: string, includeFailingCommand = false): Promise<LoadedEvalTask> {
  const taskDirectory = join(root, 'tasks', 'smoke');
  const fixture = join(root, 'tasks', 'fixture');
  await mkdir(join(fixture, 'src'), { recursive: true });
  await mkdir(taskDirectory, { recursive: true });
  await writeFile(join(fixture, 'package.json'), '{"type":"module"}\n', 'utf8');
  await writeFile(join(taskDirectory, 'expected.js'), 'export const greet = () => "hello";\n', 'utf8');
  const checks: LoadedEvalTask['checks'] = [
    { id: 'exists', type: 'file-exists', path: 'src/greet.js' },
    { id: 'contains', type: 'file-contains', path: 'src/greet.js', includes: 'greet' },
    { id: 'snapshot', type: 'snapshot', path: 'src/greet.js', expectedPath: 'expected.js' },
  ];
  if (includeFailingCommand) {
    checks.push({ id: 'command', type: 'command', command: process.execPath, args: ['-e', 'process.exit(3)'] });
  }
  return {
    schemaVersion: 1,
    id: includeFailingCommand ? 'failure' : 'success',
    title: 'test task',
    suite: 'smoke',
    prompt: 'test',
    workspace: { fixture: '../fixture' },
    checks,
    limits: { maxChangedFiles: 1 },
    definitionPath: join(taskDirectory, 'task.json'),
  };
}
