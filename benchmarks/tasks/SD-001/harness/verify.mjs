#!/usr/bin/env node
/**
 * SD-001 harness：跑测试、校验保护文件哈希、确认缺陷已修复。
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`DWB_VERIFY_FAIL: ${msg}`);
  process.exit(1);
}

async function hashFile(rel) {
  const buf = await readFile(join(workspace, rel));
  return createHash('sha256').update(buf).digest('hex');
}

const protectedPaths = [
  'test/pricing.test.js',
  'test/cart.test.js',
  'test/integration.test.js',
  'package.json',
  'ISSUE.md',
];

for (const rel of protectedPaths) {
  const expected = createHash('sha256').update(await readFile(join(taskDir, 'fixture', rel))).digest('hex');
  const got = await hashFile(rel);
  if (expected !== got) fail(`protected file changed: ${rel}`);
}

const run = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['test'], {
  cwd: workspace,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (run.status !== 0) {
  console.error(run.stdout);
  console.error(run.stderr);
  fail('pnpm test failed');
}

console.log('DWB_VERIFY_PASS');
