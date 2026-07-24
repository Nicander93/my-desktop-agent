#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { EvaluationResult } from '@desktop-agent/shared';
import { renderReport } from './report.js';

async function main(): Promise<void> {
  const input = resolve(argument('--input') ?? 'eval-results');
  const output = resolve(argument('--output') ?? join(input, 'summary.md'));
  const since = argument('--since');
  if (since && Number.isNaN(Date.parse(since))) throw new Error(`Invalid --since timestamp: ${since}`);
  const results = await findResults(input);
  const selected = since ? results.filter((result) => result.startedAt >= since) : results;
  await writeFile(output, renderReport(selected), 'utf8');
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
