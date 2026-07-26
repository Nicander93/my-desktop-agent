#!/usr/bin/env node
/** DP-003 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
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
  await assertInputUnchanged(['input/batch/valid.json']);
  const csv = await readFile(join(workspace, 'output/converted/valid.csv'), 'utf8');
  if (!csv.includes('user.name') || !csv.includes('Alice')) fail('csv content');
  const rep = JSON.parse(await readFile(join(workspace, 'output/report.json'), 'utf8'));
  if (!rep.failed?.length) fail('need failed entry');
  const tool = join(workspace, 'converter/convert.mjs');
  if (process.env.DWB_HIDDEN_ROOT) {
    try { await access(tool, constants.F_OK); const dirs = await readdir(process.env.DWB_HIDDEN_ROOT, { withFileTypes: true });
      for (const v of dirs.filter(d=>d.isDirectory())) {
        const out = join(workspace, '.h.csv');
        const r = spawnSync(process.execPath, [tool, '--from','json','--to','csv','--in', join(process.env.DWB_HIDDEN_ROOT,v.name,'input/sample.json'), '--out', out]);
        if (r.status !== 0) fail('hidden '+v.name);
      }
    } catch {}
  }
}
await main(); console.log('DWB_VERIFY_PASS');
