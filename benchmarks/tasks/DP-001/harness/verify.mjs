#!/usr/bin/env node
/**
 * DP-001 harness：校验 cleaned / invalid / report 语义，并在有 DWB_HIDDEN_ROOT 时对 hidden 输入再跑清洗工具。
 */
import { createHash } from 'node:crypto';
import { readFile, access, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`DWB_VERIFY_FAIL: ${message}`);
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    obj.__raw = line;
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

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace('customer_name', 'customer');
}

function parseAmount(value) {
  const cleaned = String(value).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  const v = String(value).trim();
  let m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function expectedFromInput(inputText) {
  const { headers, rows } = parseCsv(inputText);
  const mappedHeaders = headers.map(normalizeHeader);
  const orderIdIdx = mappedHeaders.indexOf('order_id');
  const customerIdx = mappedHeaders.findIndex((h) => h === 'customer' || h.includes('customer'));
  const amountIdx = mappedHeaders.indexOf('amount');
  const dateIdx = mappedHeaders.findIndex((h) => h.includes('date'));
  if ([orderIdIdx, customerIdx, amountIdx, dateIdx].some((i) => i < 0)) fail('input headers unexpected');

  const cleaned = [];
  const invalid = [];
  const seen = new Set();
  let duplicateRowsRemoved = 0;

  for (const row of rows) {
    const cells = splitCsvLine(row.__raw);
    const orderId = (cells[orderIdIdx] ?? '').trim();
    const customer = (cells[customerIdx] ?? '').trim();
    const amount = parseAmount(cells[amountIdx] ?? '');
    const orderDate = parseDate(cells[dateIdx] ?? '');
    if (!orderId || !customer || amount === null || !orderDate) {
      invalid.push({ order_id: orderId, reason: 'invalid_fields', raw: row.__raw });
      continue;
    }
    if (seen.has(orderId)) {
      duplicateRowsRemoved += 1;
      continue;
    }
    seen.add(orderId);
    cleaned.push({ order_id: orderId, customer, amount, order_date: orderDate });
  }

  return {
    cleaned,
    invalidCount: invalid.length,
    duplicateRowsRemoved,
    totalRows: rows.length,
    report: {
      totalRows: rows.length,
      cleanedRows: cleaned.length,
      invalidRows: invalid.length,
      duplicateRowsRemoved,
    },
  };
}

async function assertOutputs() {
  const input = await readFile(join(workspace, 'input/orders.csv'), 'utf8');
  const expected = expectedFromInput(input);

  const cleanedText = await readFile(join(workspace, 'output/cleaned.csv'), 'utf8');
  const cleaned = parseCsv(cleanedText);
  const cleanedHeaders = cleaned.headers.map((h) => h.toLowerCase());
  for (const required of ['order_id', 'customer', 'amount', 'order_date']) {
    if (!cleanedHeaders.includes(required)) fail(`cleaned.csv missing column ${required}`);
  }
  if (cleaned.rows.length !== expected.cleaned.length) {
    fail(`cleaned row count ${cleaned.rows.length} != expected ${expected.cleaned.length}`);
  }

  const byId = new Map(expected.cleaned.map((r) => [r.order_id, r]));
  for (const row of cleaned.rows) {
    const id = row.order_id ?? row.Order_Id;
    const exp = byId.get(id);
    if (!exp) fail(`unexpected cleaned order_id ${id}`);
    const customer = row.customer ?? row.Customer;
    const amount = Number(row.amount ?? row.Amount);
    const date = row.order_date ?? row.Order_Date;
    if (customer !== exp.customer) fail(`customer mismatch for ${id}`);
    if (amount !== exp.amount) fail(`amount mismatch for ${id}: ${amount} vs ${exp.amount}`);
    if (date !== exp.order_date) fail(`date mismatch for ${id}: ${date} vs ${exp.order_date}`);
  }

  const invalidText = await readFile(join(workspace, 'output/invalid_rows.csv'), 'utf8');
  const invalid = parseCsv(invalidText);
  if (invalid.rows.length !== expected.invalidCount) {
    fail(`invalid row count ${invalid.rows.length} != expected ${expected.invalidCount}`);
  }
  if (!invalid.headers.map((h) => h.toLowerCase()).includes('reason')) {
    fail('invalid_rows.csv must include reason column');
  }

  const report = JSON.parse(await readFile(join(workspace, 'output/report.json'), 'utf8'));
  for (const key of ['totalRows', 'cleanedRows', 'invalidRows', 'duplicateRowsRemoved']) {
    if (report[key] !== expected.report[key]) fail(`report.${key}=${report[key]} expected ${expected.report[key]}`);
  }

  const baselineInput = await readFile(join(taskDir, 'fixture/input/orders.csv'));
  const currentInput = await readFile(join(workspace, 'input/orders.csv'));
  if (!baselineInput.equals(currentInput)) fail('input/orders.csv was modified');
}

async function findCleanerScript() {
  const candidates = ['clean.mjs', 'clean.js', 'scripts/clean.mjs', 'scripts/clean.js', 'tools/clean.mjs'];
  for (const rel of candidates) {
    try {
      await access(join(workspace, rel), constants.F_OK);
      return rel;
    } catch { /* continue */ }
  }
  return null;
}

async function runHidden() {
  const hiddenRoot = process.env.DWB_HIDDEN_ROOT;
  if (!hiddenRoot) return;
  const variants = await readdir(hiddenRoot, { withFileTypes: true });
  const dirs = variants.filter((e) => e.isDirectory()).map((e) => e.name);
  if (dirs.length === 0) return;
  const cleaner = await findCleanerScript();
  if (!cleaner) {
    // 允许仅验证公开 fixture；若存在 hidden 但无通用工具，跳过 hidden 工具复跑
    console.error('DWB_VERIFY_WARN: no reusable cleaner script found for hidden variants');
    return;
  }
  for (const variant of dirs) {
    const variantDir = join(hiddenRoot, variant);
    const tmp = join(workspace, `.hidden-verify-${variant}`);
    await mkdir(join(tmp, 'input'), { recursive: true });
    await mkdir(join(tmp, 'output'), { recursive: true });
    const files = await readdir(join(variantDir, 'input')).catch(() => []);
    for (const file of files) {
      await copyFile(join(variantDir, 'input', file), join(tmp, 'input', file));
    }
    const run = spawnSync(process.execPath, [join(workspace, cleaner), tmp], { encoding: 'utf8' });
    if (run.status !== 0) {
      // 兼容：脚本无参、只清洗 cwd
      const run2 = spawnSync(process.execPath, [join(workspace, cleaner)], { cwd: tmp, encoding: 'utf8' });
      if (run2.status !== 0) fail(`hidden variant ${variant}: cleaner failed`);
    }
    const reportPath = join(tmp, 'output/report.json');
    try {
      await access(reportPath, constants.F_OK);
    } catch {
      fail(`hidden variant ${variant}: missing output/report.json`);
    }
  }
}

await assertOutputs();
await runHidden();
console.log('DWB_VERIFY_PASS');
