#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadTaskCollection } from './collection.js';
import { loadTask } from './task.js';
import { RuntimeAgentExecutor, runTask } from './runner.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tasks = args.task ? [await loadTask(args.task)] : await loadTaskCollection(args.benchmarksRoot, { suite: args.suite, taskIds: args.taskIds });
  if (args.dryRun) {
    console.log(JSON.stringify({ tasks: tasks.map((task) => task.id), model: args.model, baseURL: args.baseURL }, null, 2));
    return;
  }
  const executor = new RuntimeAgentExecutor({
    apiKey: process.env.AGENT_EVAL_API_KEY ?? process.env.CODEANY_API_KEY ?? '',
    apiType: 'openai-completions',
    model: args.model,
    baseURL: args.baseURL,
    permissionMode: 'bypassPermissions',
  });
  const results = [];
  for (const task of tasks) results.push(await runTask(task, { outputRoot: args.output, executor, model: { model: args.model, baseURL: args.baseURL } }));
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  if (results.some((result) => result.status !== 'passed')) process.exitCode = 1;
}

function parseArgs(argv: string[]): { task?: string; taskIds?: string[]; suite?: string; benchmarksRoot: string; output: string; model: string; baseURL?: string; dryRun: boolean } {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const task = get('--task');
  const suite = get('--suite');
  const taskIds = argv.filter((value, index) => argv[index - 1] === '--task-id');
  const dryRun = argv.includes('--dry-run');
  const model = get('--model') ?? process.env.CODEANY_MODEL;
  if (!model && !dryRun) throw new Error('Usage: agent-eval (--task <task.json> | --suite <suite> | --task-id <id>) --model <model> [--base-url <url>] [--output <dir>]');
  if (!task && !suite && taskIds.length === 0) throw new Error('Select a task file, suite, or task id.');
  return {
    task: task ? resolve(task) : undefined,
    taskIds,
    suite,
    benchmarksRoot: resolve(get('--benchmarks-root') ?? 'benchmarks/tasks'),
    model: model ?? 'unconfigured',
    baseURL: get('--base-url') ?? process.env.CODEANY_BASE_URL,
    output: resolve(get('--output') ?? 'eval-results'),
    dryRun,
  };
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
