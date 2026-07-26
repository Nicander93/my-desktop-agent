#!/usr/bin/env node
/**
 * 扫描 eval-results 目录，合并 result.json 写出 summary.md。
 * --since 按 startedAt ISO 过滤；--group-by domain,difficulty 按 metadata 聚合。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { EvaluationResult } from '@desktop-agent/shared';
import { renderReportAsync } from './report.js';

async function main(): Promise<void> {
  const input = resolve(argument('--input') ?? 'eval-results');
  const output = resolve(argument('--output') ?? join(input, 'summary.md'));
  const since = argument('--since');
  const groupByRaw = argument('--group-by') ?? '';
  const groupBy = groupByRaw.split(',').map((part) => part.trim()).filter(Boolean) as Array<'domain' | 'difficulty' | 'task'>;
  if (since && Number.isNaN(Date.parse(since))) throw new Error(`Invalid --since timestamp: ${since}`);
  const results = await findResults(input);
  const selected = since ? results.filter((result) => result.startedAt >= since) : results;
  const markdown = await renderReportAsync(selected, {
    groupBy,
    benchmarksRoot: resolve(argument('--benchmarks-root') ?? 'benchmarks/tasks'),
  });
  await writeFile(output, markdown, 'utf8');
  console.log(output);
}
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function findResults(directory: string): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await findResults(path));
    else if (entry.name === 'result.json') results.push(JSON.parse(await readFile(path, 'utf8')) as EvaluationResult);
  }
  return results;
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
