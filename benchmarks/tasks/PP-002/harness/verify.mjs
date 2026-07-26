#!/usr/bin/env node
/** PP-002 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
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
  await assertInputUnchanged(['input/photo-index.json']);
  const index = JSON.parse(await readFile(join(workspace, 'input/photo-index.json'), 'utf8'));
  const man = parseCsv(await readFile(join(workspace, 'output/manifest.csv'), 'utf8'));
  const warn = JSON.parse(await readFile(join(workspace, 'output/warnings.json'), 'utf8'));
  const images = index.items.filter((i) => i.isImage);
  if (man.rows.length !== images.length) fail('manifest count');
  if (!warn.skippedNonImages.includes('photos/notes.txt')) fail('notes not skipped');
  if (!warn.missingExif.includes('photos/c.jpg')) fail('missing exif');
  if (!warn.renamedCollisions.length) fail('collision rename expected');
  for (const row of man.rows) {
    try { await access(join(workspace, 'output', row.dest_path), constants.F_OK); } catch { fail('missing ' + row.dest_path); }
  }
}
await main(); console.log('DWB_VERIFY_PASS');
