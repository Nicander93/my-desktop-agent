#!/usr/bin/env tsx
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModelPreset, toRuntimeOptions } from './model-presets.js';
import { RuntimeAgentExecutor, runTasks } from './runner.js';
import type { EvalSuite } from './task-schema.js';
import { loadTasks, selectTasks } from './tasks.js';

interface CliOptions {
  suite?: EvalSuite;
  taskIds?: string[];
  model: string;
  output?: string;
  keepWorkspace: boolean;
  dryRun: boolean;
  validateConfig: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const tasks = selectTasks(await loadTasks(resolve(moduleDirectory, 'tasks')), {
    suite: options.suite,
    taskIds: options.taskIds,
  });
  const preset = getModelPreset(options.model);
  if (options.suite && !preset.suites.includes(options.suite)) {
    throw new Error(`Model preset "${preset.id}" is not intended for the ${options.suite} suite.`);
  }
  if (options.dryRun) {
    console.log(JSON.stringify({ model: preset.id, tasks: tasks.map((task) => task.id) }, null, 2));
    return;
  }
  const runtimeOptions = toRuntimeOptions(preset);
  if (options.validateConfig) {
    console.log(JSON.stringify({
      model: preset.id,
      provider: preset.provider,
      modelName: preset.model,
      baseURL: preset.baseURL,
      taskCount: tasks.length,
      configured: true,
    }, null, 2));
    return;
  }
  const executor = new RuntimeAgentExecutor(runtimeOptions);
  const runsRoot = options.output ? resolve(process.cwd(), options.output) : resolve(moduleDirectory, 'runs');
  const { runDirectory, results } = await runTasks({
    tasks,
    runsRoot,
    model: preset,
    executor,
    keepWorkspace: options.keepWorkspace,
  });
  console.log(`Evaluation artifacts: ${runDirectory}`);
  console.table(results.map((result) => ({
    task: result.task.id,
    status: result.status,
    outcome: `${result.outcome.percentage}%`,
    durationMs: result.durationMs,
  })));
  if (results.some((result) => result.status !== 'pass')) process.exitCode = 1;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { model: 'environment', keepWorkspace: true, dryRun: false, validateConfig: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    switch (argument) {
      case '--':
        // pnpm versions differ on whether this forwarding delimiter reaches scripts.
        break;
      case '--suite':
        if (!isSuite(value)) throw new Error('--suite must be smoke, regression, or quality.');
        options.suite = value;
        index += 1;
        break;
      case '--task':
        if (!value) throw new Error('--task needs a task id.');
        options.taskIds = [...(options.taskIds ?? []), ...value.split(',').filter(Boolean)];
        index += 1;
        break;
      case '--model':
        if (!value) throw new Error('--model needs a preset id.');
        options.model = value;
        index += 1;
        break;
      case '--output':
        if (!value) throw new Error('--output needs a directory.');
        options.output = value;
        index += 1;
        break;
      case '--keep-workspace':
        options.keepWorkspace = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--validate-config':
        options.validateConfig = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.suite && !options.taskIds?.length) {
    throw new Error('Select at least one task with --suite or --task. Use --help for usage.');
  }
  return options;
}

function isSuite(value: string | undefined): value is EvalSuite {
  return value === 'smoke' || value === 'regression' || value === 'quality';
}

function printHelp(): void {
  console.log(`Usage: pnpm eval:coding -- --suite <suite> [options]

Options:
  --suite <smoke|regression|quality>
  --task <id[,id]>                 Select explicit task(s); may be repeated.
  --model <preset>                 Defaults to environment.
  --output <directory>             Artifact directory (defaults to evals/coding/runs).
  --dry-run                        Validate and print the selected run without calling a model.
  --validate-config                Verify model credentials without calling a model or exposing secrets.
  --keep-workspace                 Kept for explicitness; workspaces are always retained for review.
`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
