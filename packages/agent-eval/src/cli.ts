#!/usr/bin/env node
/**
 * agent-eval 入口。
 * 启动时 loadProjectEnv() 读仓库根 .env；Key：AGENT_EVAL_API_KEY → CODEANY_API_KEY。
 * 模型：--model 或 CODEANY_MODEL（推荐只配 .env）。
 * --concurrency N：拆成 N 个独立子进程并行跑（多现场），每现场一批 task-id。
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from '@desktop-agent/shared/env';
import { DESKTOP_AGENT_BASH_ENV } from '@desktop-agent/shared/runtime';
import { loadTaskCollection } from './collection.js';
import { createProgressSink } from './progress.js';
import { loadTask } from './task.js';
import { RuntimeAgentExecutor, runTask } from './runner.js';
import { buildEvalSubprocessEnv } from './subprocessEnv.js';

async function main(): Promise<void> {
  loadProjectEnv();
  const args = parseArgs(process.argv.slice(2));
  const tasks = args.task
    ? [await loadTask(args.task)]
    : await loadTaskCollection(args.benchmarksRoot, {
      suite: args.suite,
      taskIds: args.taskIds,
      tag: args.tag,
      domain: args.domain,
      difficulty: args.difficulty,
    });
  if (args.dryRun) {
    console.log(JSON.stringify({
      tasks: tasks.map((task) => task.id),
      model: args.model,
      baseURL: args.baseURL,
      repeat: args.repeat,
      concurrency: args.concurrency,
    }, null, 2));
    return;
  }
  if (!args.worker && args.concurrency > 1 && tasks.length > 1) {
    await runMultiSite(tasks.map((task) => task.id), args);
    return;
  }
  await runSequential(tasks, args);
}

/** 多现场：主进程只分片 spawn，每个子进程独立跑一批 task-id */
async function runMultiSite(taskIds: string[], args: ParsedArgs): Promise<void> {
  const sites = Math.min(args.concurrency, taskIds.length);
  const shards = partitionRoundRobin(taskIds, sites);
  const cliPath = fileURLToPath(import.meta.url);
  const onProgress = createProgressSink(args.quiet);
  onProgress(`[eval] multi-site concurrency=${sites} tasks=${taskIds.length}`);
  for (const [index, shard] of shards.entries()) {
    onProgress(`[eval] site-${index + 1}: ${shard.join(', ')}`);
  }
  const exits = await Promise.all(shards.map((shard, index) => new Promise<number>((resolveExit) => {
    const childArgs = [
      cliPath,
      '--worker',
      `--site-id`, String(index + 1),
      ...shard.flatMap((id) => ['--task-id', id]),
      '--output', args.output,
      '--benchmarks-root', args.benchmarksRoot,
      ...(args.quiet ? ['--quiet'] : []),
      ...(args.diagnose ? ['--diagnose'] : []),
      ...(args.repeat > 1 ? ['--repeat', String(args.repeat)] : []),
    ];
    const child = spawn(process.execPath, childArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      cwd: process.cwd(),
    });
    const prefix = `[site-${index + 1}] `;
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line) process.stdout.write(`${prefix}${line}\n`);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line) process.stderr.write(`${prefix}${line}\n`);
      }
    });
    child.on('exit', (code) => resolveExit(code ?? 1));
  })));
  if (exits.some((code) => code !== 0)) process.exitCode = 1;
}

async function runSequential(tasks: Awaited<ReturnType<typeof loadTaskCollection>>, args: ParsedArgs): Promise<void> {
  const onProgress = createProgressSink(args.quiet);
  const subprocessEnv = buildEvalSubprocessEnv();
  const bashPath = subprocessEnv[DESKTOP_AGENT_BASH_ENV];
  if (bashPath) onProgress(`[eval] Bash → ${bashPath}`);
  onProgress(`[eval] model=${args.model}${args.baseURL ? ` baseURL=${args.baseURL}` : ''} tasks=${tasks.map((t) => t.id).join(',')}`);
  const executor = new RuntimeAgentExecutor({
    apiKey: process.env.AGENT_EVAL_API_KEY ?? process.env.CODEANY_API_KEY ?? '',
    apiType: 'openai-completions',
    model: args.model,
    baseURL: args.baseURL,
    permissionMode: 'bypassPermissions',
  }, subprocessEnv);
  const results = [];
  for (const task of tasks) {
    for (let i = 0; i < args.repeat; i += 1) {
      const result = await runTask(task, {
        outputRoot: args.output,
        executor,
        model: { model: args.model, baseURL: args.baseURL },
        onProgress,
      });
      results.push(result);
      if (args.diagnose && result.status !== 'passed') {
        const diagnostics = task.metadata?.diagnostics ?? [];
        for (const diagnosticId of diagnostics) {
          try {
            const diagnostic = (await loadTaskCollection(args.benchmarksRoot, { taskIds: [diagnosticId] }))[0]!;
            const diagnoseResult = await runTask(diagnostic, {
              outputRoot: resolve(args.output, task.id, result.runId, 'diagnose'),
              executor,
              model: { model: args.model, baseURL: args.baseURL },
              onProgress,
            });
            results.push(diagnoseResult);
            if (diagnoseResult.status !== 'passed') break;
          } catch (error) {
            onProgress(`[eval] diagnose skip ${diagnosticId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  if (results.some((result) => result.status !== 'passed')) process.exitCode = 1;
}

function partitionRoundRobin<T>(items: T[], parts: number): T[][] {
  const shards: T[][] = Array.from({ length: parts }, () => []);
  items.forEach((item, index) => {
    shards[index % parts]!.push(item);
  });
  return shards.filter((shard) => shard.length > 0);
}

interface ParsedArgs {
  task?: string;
  taskIds?: string[];
  suite?: string;
  tag?: string;
  domain?: string;
  difficulty?: string;
  benchmarksRoot: string;
  output: string;
  model: string;
  baseURL?: string;
  dryRun: boolean;
  quiet: boolean;
  repeat: number;
  diagnose: boolean;
  concurrency: number;
  worker: boolean;
  siteId?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const task = get('--task');
  const suite = get('--suite');
  const tag = get('--tag');
  const domain = get('--domain');
  const difficulty = get('--difficulty');
  const taskIds = argv.filter((value, index) => argv[index - 1] === '--task-id');
  const dryRun = argv.includes('--dry-run');
  const quiet = argv.includes('--quiet');
  const diagnose = argv.includes('--diagnose');
  const all = argv.includes('--all');
  const worker = argv.includes('--worker');
  const siteId = get('--site-id');
  const repeatRaw = get('--repeat');
  const repeat = repeatRaw ? Number(repeatRaw) : 1;
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat must be a positive integer.');
  const concurrencyRaw = get('--concurrency');
  const concurrency = concurrencyRaw ? Number(concurrencyRaw) : 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive integer.');
  const model = get('--model') ?? process.env.CODEANY_MODEL;
  if (!model && !dryRun) {
    throw new Error('Model missing. Set CODEANY_MODEL in .env, or pass --model <model>.');
  }
  if (!all && !task && !suite && taskIds.length === 0 && !tag && !domain && !difficulty) {
    throw new Error('Select --all, a task file, suite, task id, tag, domain, or difficulty.');
  }
  return {
    task: task ? resolve(task) : undefined,
    taskIds,
    suite,
    tag,
    domain,
    difficulty,
    benchmarksRoot: resolve(get('--benchmarks-root') ?? 'benchmarks/tasks'),
    model: model ?? 'unconfigured',
    baseURL: get('--base-url') ?? process.env.CODEANY_BASE_URL,
    output: resolve(get('--output') ?? 'eval-results'),
    dryRun,
    quiet,
    repeat,
    diagnose,
    concurrency,
    worker,
    siteId,
  };
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
