#!/usr/bin/env node
/**
 * agent-eval 入口。
 * 启动时 loadProjectEnv() 读仓库根 .env；Key：AGENT_EVAL_API_KEY → CODEANY_API_KEY。
 * 模型：--model 或 CODEANY_MODEL。过程日志打 stderr；--quiet 关闭。见 benchmarks/README.md。
 */
import { resolve } from 'node:path';
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
    console.log(JSON.stringify({ tasks: tasks.map((task) => task.id), model: args.model, baseURL: args.baseURL, repeat: args.repeat }, null, 2));
    return;
  }
  const onProgress = createProgressSink(args.quiet);
  const subprocessEnv = buildEvalSubprocessEnv();
  const bashPath = subprocessEnv[DESKTOP_AGENT_BASH_ENV];
  if (bashPath) {
    onProgress(`[eval] Bash → ${bashPath}`);
  }
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

function parseArgs(argv: string[]): {
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
} {
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
  const repeatRaw = get('--repeat');
  const repeat = repeatRaw ? Number(repeatRaw) : 1;
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat must be a positive integer.');
  const model = get('--model') ?? process.env.CODEANY_MODEL;
  if (!model && !dryRun) throw new Error('Usage: agent-eval (--task <task.json> | --suite <suite> | --task-id <id> | --tag <tag>) --model <model> [--base-url <url>] [--output <dir>] [--repeat N] [--diagnose] [--quiet]');
  if (!task && !suite && taskIds.length === 0 && !tag && !domain && !difficulty) {
    throw new Error('Select a task file, suite, task id, tag, domain, or difficulty.');
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
  };
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
