#!/usr/bin/env node
/**
 * OA-001 reference：纯 Node 生成最小 xlsx + summary.json。
 */
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

function parsePrice(v) {
  return Number(String(v).replace(/[$,\s]/g, ''));
}

function parseDate(v) {
  const s = String(v).trim();
  let m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sheetXml(rows) {
  const body = rows.map((row, ri) => {
    const cells = row.map((val, ci) => {
      const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
      if (typeof val === 'number') return `<c r="${ref}"><v>${val}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${esc(val)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, dataRaw] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(dataRaw);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local, data);
    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

const csv = await readFile(join(root, 'input/sales.csv'), 'utf8');
const lines = csv.replace(/\r\n/g, '\n').trim().split('\n');
const rawRows = lines.map((l) => splitCsvLine(l));
const cleanedHeader = ['region', 'product', 'units', 'price', 'date', 'revenue'];
const cleanedData = [];
const byRegion = new Map();
for (const cells of rawRows.slice(1)) {
  const [region, product, units, price, date] = cells;
  if (!product?.trim()) continue;
  const u = Number(units);
  const p = parsePrice(price);
  const d = parseDate(date);
  const revenue = Math.round(u * p * 100) / 100;
  cleanedData.push([region, product, u, p, d, revenue]);
  byRegion.set(region, Math.round(((byRegion.get(region) ?? 0) + revenue) * 100) / 100);
}
const cleanedSheet = [cleanedHeader, ...cleanedData];
let topRegion = '';
let topVal = -1;
for (const [r, v] of byRegion) {
  if (v > topVal) { topVal = v; topRegion = r; }
}
const totalRevenue = Math.round([...byRegion.values()].reduce((a, b) => a + b, 0) * 100) / 100;

const summaryRows = [['region', 'revenue'], ...[...byRegion.entries()].sort((a, b) => a[0].localeCompare(b[0]))];

const chartXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:tx><c:v>Revenue</c:v></c:tx></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;

const files = [
  ['[Content_Types].xml', Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)],
  ['_rels/.rels', Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)],
  ['xl/workbook.xml', Buffer.from(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="RawData" sheetId="1" r:id="rId1"/><sheet name="Cleaned" sheetId="2" r:id="rId2"/><sheet name="Summary" sheetId="3" r:id="rId3"/></sheets></workbook>`)],
  ['xl/_rels/workbook.xml.rels', Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/></Relationships>`)],
  ['xl/worksheets/sheet1.xml', Buffer.from(sheetXml(rawRows))],
  ['xl/worksheets/sheet2.xml', Buffer.from(sheetXml(cleanedSheet))],
  ['xl/worksheets/sheet3.xml', Buffer.from(sheetXml([...summaryRows, ['totalRevenue', totalRevenue], ['topRegion', topRegion]]))],
  ['xl/charts/chart1.xml', Buffer.from(chartXml)],
];

await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output/dashboard.xlsx'), zipStore(files));
await writeFile(join(root, 'output/summary.json'), `${JSON.stringify({
  totalRevenue,
  cleanedRowCount: cleanedData.length,
  regionCount: byRegion.size,
  topRegion,
  sheets: ['RawData', 'Cleaned', 'Summary'],
  chartCount: 1,
}, null, 2)}\n`);
console.log('OA-001 reference outputs written');
