#!/usr/bin/env node
/** BW-002 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
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
  await assertInputUnchanged(['input/sales.csv']);
  const csv = parseCsv(await readFile(join(workspace, 'input/sales.csv'), 'utf8'));
  const total = csv.rows.reduce((s,r)=>s+Number(r.amount),0);
  const byReg = {};
  csv.rows.forEach(r=>{ byReg[r.region]=(byReg[r.region]||0)+Number(r.amount); });
  const top = Object.entries(byReg).sort((a,b)=>b[1]-a[1])[0];
  const met = JSON.parse(await readFile(join(workspace, 'output/metrics.json'), 'utf8'));
  if (met.total !== total) fail('metrics total');
  if (met.topRegion !== top[0]) fail('top region');
  try { await access(join(workspace, 'output/sales-analysis.xlsx'), constants.F_OK); } catch { fail('xlsx missing'); }
  const ppt = await readFile(join(workspace, 'output/management-brief.pptx'));
  const slides = (ppt.toString('latin1').match(/<p:sld /g)||[]).length;
  if (slides < 3) fail('ppt slides');
  if (!ppt.toString('latin1').includes(top[0])) fail('ppt top region');
  if (met.pptSlideCount !== slides) fail('slide count sync');
}
await main(); console.log('DWB_VERIFY_PASS');
