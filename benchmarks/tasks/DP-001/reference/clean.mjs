#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();

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

const text = await readFile(join(root, 'input/orders.csv'), 'utf8');
const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_').replace('customer_name', 'customer'));
const orderIdIdx = headers.indexOf('order_id');
const customerIdx = headers.findIndex((h) => h === 'customer' || h.includes('customer'));
const amountIdx = headers.indexOf('amount');
const dateIdx = headers.findIndex((h) => h.includes('date'));

const cleaned = [];
const invalid = [];
const seen = new Set();
let duplicateRowsRemoved = 0;

for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const cells = splitCsvLine(line);
  const orderId = (cells[orderIdIdx] ?? '').trim();
  const customer = (cells[customerIdx] ?? '').trim();
  const amount = parseAmount(cells[amountIdx] ?? '');
  const orderDate = parseDate(cells[dateIdx] ?? '');
  if (!orderId || !customer || amount === null || !orderDate) {
    invalid.push(`${line},invalid_fields`);
    continue;
  }
  if (seen.has(orderId)) {
    duplicateRowsRemoved += 1;
    continue;
  }
  seen.add(orderId);
  cleaned.push(`${orderId},${customer},${amount},${orderDate}`);
}

await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output/cleaned.csv'), ['order_id,customer,amount,order_date', ...cleaned].join('\n') + '\n');
await writeFile(join(root, 'output/invalid_rows.csv'), ['raw,reason', ...invalid.map((r) => {
  const reason = 'invalid_fields';
  const raw = r.slice(0, -(',invalid_fields'.length));
  return `"${raw.replaceAll('"', '""')}",${reason}`;
})].join('\n') + '\n');
await writeFile(join(root, 'output/report.json'), JSON.stringify({
  totalRows: lines.length - 1,
  cleanedRows: cleaned.length,
  invalidRows: invalid.length,
  duplicateRowsRemoved,
}, null, 2) + '\n');
