#!/usr/bin/env node
/** FM-001 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
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

import { createHash } from 'node:crypto';
async function hash(p){return createHash('sha256').update(await readFile(join(workspace,p))).digest('hex');}
async function main() {
  await assertInputUnchanged(['input/tree/a.txt']);
  const dup = JSON.parse(await readFile(join(workspace, 'output/duplicates.json'), 'utf8'));
  const h1 = await hash('input/tree/dup1.txt'); const h2 = await hash('input/tree/sub/dup2.txt');
  if (h1 !== h2) fail('fixture dup mismatch');
  const group = dup.exact?.find(g=>g.hash===h1);
  if (!group || group.files.length < 2) fail('exact dup group');
  if (!dup.suspected?.length) fail('suspected needed');
  const audit = await readFile(join(workspace, 'output/audit.md'), 'utf8');
  if (!audit.includes('wastedBytes') && !audit.includes('space')) fail('audit stats');
}
await main(); console.log('DWB_VERIFY_PASS');
