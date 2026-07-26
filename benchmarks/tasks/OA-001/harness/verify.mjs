#!/usr/bin/env node
/**
 * OA-001：从 sales.csv 计算期望指标；解压 xlsx 校验 sheet/数值/图表。
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`DWB_VERIFY_FAIL: ${msg}`);
  process.exit(1);
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

function parsePrice(v) {
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDate(v) {
  const s = String(v).trim();
  let m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function expectedFromCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const cleaned = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const product = (cells[idx.product] ?? '').trim();
    if (!product) continue;
    const units = Number(cells[idx.units]);
    const price = parsePrice(cells[idx.price]);
    const date = parseDate(cells[idx.date]);
    if (!Number.isFinite(units) || price === null || !date) continue;
    cleaned.push({
      region: cells[idx.region],
      product,
      units,
      price,
      date,
      revenue: Math.round(units * price * 100) / 100,
    });
  }
  const byRegion = new Map();
  for (const row of cleaned) {
    byRegion.set(row.region, (byRegion.get(row.region) ?? 0) + row.revenue);
  }
  const totalRevenue = Math.round([...byRegion.values()].reduce((a, b) => a + b, 0) * 100) / 100;
  let topRegion = '';
  let topVal = -1;
  for (const [region, val] of byRegion) {
    if (val > topVal) { topVal = val; topRegion = region; }
  }
  return {
    cleaned,
    totalRevenue,
    cleanedRowCount: cleaned.length,
    regionCount: byRegion.size,
    topRegion,
    byRegion,
  };
}

function readZipEntries(buf) {
  const entries = new Map();
  let offset = 0;
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const raw = compMethod === 8 ? inflateRawSync(comp) : Buffer.from(comp);
    if (compMethod !== 0 && compMethod !== 8) fail(`unsupported zip method ${compMethod} for ${name}`);
    entries.set(name, raw.toString('utf8'));
    offset = dataStart + compSize;
  }
  return entries;
}

function cellValues(sheetXml) {
  const vals = [];
  const re = /<c[^>]*>(?:<v>([^<]*)<\/v>)?(?:<is><t[^>]*>([^<]*)<\/t><\/is>)?/g;
  let m;
  while ((m = re.exec(sheetXml)) !== null) {
    if (m[1] !== undefined) vals.push(m[1]);
    else if (m[2] !== undefined) vals.push(m[2]);
  }
  return vals;
}

async function assertInput() {
  const a = await readFile(join(taskDir, 'fixture/input/sales.csv'));
  const b = await readFile(join(workspace, 'input/sales.csv'));
  if (!a.equals(b)) fail('input/sales.csv modified');
}

await assertInput();
const csv = await readFile(join(workspace, 'input/sales.csv'), 'utf8');
const exp = expectedFromCsv(csv);

const summary = JSON.parse(await readFile(join(workspace, 'output/summary.json'), 'utf8'));
for (const [k, v] of Object.entries({
  totalRevenue: exp.totalRevenue,
  cleanedRowCount: exp.cleanedRowCount,
  regionCount: exp.regionCount,
  topRegion: exp.topRegion,
})) {
  if (summary[k] !== v) fail(`summary.${k}=${summary[k]} expected ${v}`);
}
if (!Array.isArray(summary.sheets) || summary.sheets.length < 3) fail('summary.sheets must list >=3 sheets');
const requiredSheets = ['RawData', 'Cleaned', 'Summary'];
for (const s of requiredSheets) {
  if (!summary.sheets.includes(s)) fail(`summary.sheets missing ${s}`);
}
if ((summary.chartCount ?? 0) < 1) fail('summary.chartCount must be >= 1');

const xlsxBuf = await readFile(join(workspace, 'output/dashboard.xlsx'));
const entries = readZipEntries(xlsxBuf);
if (!entries.has('[Content_Types].xml')) fail('invalid xlsx package');
const sheets = [...entries.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
if (sheets.length < 3) fail(`expected >=3 worksheets, got ${sheets.length}`);
const charts = [...entries.keys()].filter((k) => /^xl\/charts\/chart\d+\.xml$/.test(k));
if (charts.length < 1) fail('expected >=1 chart');

const workbook = entries.get('xl/workbook.xml') ?? '';
for (const name of requiredSheets) {
  if (!workbook.includes(name)) fail(`workbook.xml missing sheet name ${name}`);
}

const summaryXml = [...entries.entries()].find(([k, v]) => k.startsWith('xl/worksheets/') && v.includes('Summary'))?.[1]
  ?? entries.get('xl/worksheets/sheet3.xml');
if (!summaryXml) fail('Summary sheet xml missing');
const vals = cellValues(summaryXml);
const revenueStr = String(exp.totalRevenue);
if (!vals.some((v) => v === revenueStr || v === exp.topRegion)) {
  fail('Summary sheet missing expected total or top region values');
}

console.log('DWB_VERIFY_PASS');
