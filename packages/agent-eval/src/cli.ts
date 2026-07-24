#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadTask } from './task.js';
import { RuntimeAgentExecutor, runTask } from './runner.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const task = await loadTask(args.task);
  const executor = new RuntimeAgentExecutor({
    apiKey: process.env.AGENT_EVAL_API_KEY ?? process.env.CODEANY_API_KEY ?? '',
    apiType: 'openai-completions',
    model: args.model,
    baseURL: args.baseURL,
    permissionMode: 'bypassPermissions',
  });
  const result = await runTask(task, { outputRoot: args.output, executor, model: { model: args.model, baseURL: args.baseURL } });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
}

function parseArgs(argv: string[]): { task: string; output: string; model: string; baseURL?: string } {
  const get = (name: string) => argv[argv.indexOf(name) + 1];
  const task = get('--task');
  const model = get('--model');
  if (!task || !model) throw new Error('Usage: agent-eval --task <task.json> --model <model> [--base-url <url>] [--output <dir>]');
  return { task: resolve(task), model, baseURL: get('--base-url'), output: resolve(get('--output') ?? 'eval-results') };
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
