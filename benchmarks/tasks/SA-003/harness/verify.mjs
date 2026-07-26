#!/usr/bin/env node
/** SA-003 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
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

async function main() {
  await assertInputUnchanged(['input/inventory.json']);
  const inv = JSON.parse(await readFile(join(workspace, 'input/inventory.json'), 'utf8'));
  const plan = parseCsv(await readFile(join(workspace, 'output/cleanup-plan.csv'), 'utf8'));
  if (plan.rows.length !== inv.files.length) fail('coverage');
  const prot = plan.rows.find(r=>r.path.includes('protected'));
  if (!prot || prot.risk !== 'high' || prot.action !== 'skip') fail('protected rule');
  const cache = plan.rows.find(r=>r.path.includes('cache'));
  if (!cache || cache.action !== 'delete_candidate') fail('cache action');
  const sum = await readFile(join(workspace, 'output/summary.md'), 'utf8');
  const total = inv.files.reduce((s,f)=>s+f.size_bytes,0);
  if (!sum.includes(String(total))) fail('size total');
}
await main(); console.log('DWB_VERIFY_PASS');
