#!/usr/bin/env node
/** SD-003 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
import { readFile, access, readdir, copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`DWB_VERIFY_FAIL: ${message}`);
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

async function assertInputUnchanged(relPaths) {
  for (const rel of relPaths) {
    const base = await readFile(join(taskDir, 'fixture', rel));
    const cur = await readFile(join(workspace, rel));
    if (!base.equals(cur)) fail(`protected input modified: ${rel}`);
  }
}

import { spawnSync } from 'node:child_process';
async function main() {
  await assertInputUnchanged(['test/app.test.js']);
  const pkg = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'));
  if (!pkg.dependencies?.semver || pkg.dependencies.semver.startsWith('6')) fail('semver not upgraded');
  const src = await readFile(join(workspace, 'src/app.js'), 'utf8');
  if (!src.includes('semver.compare')) fail('must use semver.compare');
  const note = await readFile(join(workspace, 'output/migration-note.md'), 'utf8');
  if (!note.toLowerCase().includes('semver')) fail('migration note');
  const install = spawnSync('npm', ['install', '--no-fund', '--no-audit'], {
    cwd: workspace,
    shell: true,
    encoding: 'utf8',
  });
  if (install.status !== 0) fail(`npm install failed: ${install.stderr || install.stdout}`);
  try {
    await access(join(workspace, 'node_modules/semver'), constants.F_OK);
  } catch {
    fail('semver missing after npm install');
  }
  const r = spawnSync('npm', ['test'], { cwd: workspace, shell: true, encoding: 'utf8' });
  if (r.status !== 0) fail(`tests failed: ${r.stderr || r.stdout}`);
}
await main(); console.log('DWB_VERIFY_PASS');
