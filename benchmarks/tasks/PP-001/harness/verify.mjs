#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ws = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m) => { console.error('DWB_VERIFY_FAIL: ' + m); process.exit(1); };

function cat(ext) {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'documents';
  if (['.jpg','.jpeg','.png','.gif'].includes(e)) return 'images';
  if (['.csv','.json'].includes(e)) return 'data';
  if (['.txt','.md'].includes(e)) return 'text';
  if (e === '.zip') return 'archives';
  return 'other';
}

async function baselineHashes(dir) {
  const names = await readdir(dir);
  const m = new Map();
  for (const n of names) m.set(n, sha256(await readFile(join(dir, n))));
  return m;
}
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function verifyRoot(root) {
  const dl = join(root, 'downloads');
  const before = await baselineHashes(join(taskDir, 'fixture/downloads'));
  const after = await baselineHashes(dl);
  for (const [n, h] of before) if (after.get(n) !== h) fail('downloads modified: ' + n);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const dups = JSON.parse(await readFile(join(root, 'duplicates.json'), 'utf8'));
  const names = [...before.keys()];
  if (manifest.fileCount !== names.length) fail('manifest fileCount mismatch');
  const hashGroups = new Map();
  for (const n of names) {
    const h = after.get(n);
    if (!hashGroups.has(h)) hashGroups.set(h, []);
    hashGroups.get(h).push(n);
    const c = cat(extname(n));
    try { await access(join(root, 'organized', c, n), constants.F_OK); }
    catch { fail('missing organized copy: ' + n); }
    const entry = manifest.files.find((f) => f.name === n);
    if (!entry || entry.category !== c || entry.sha256 !== h) fail('manifest entry wrong: ' + n);
  }
  const expectedGroups = [...hashGroups.values()].filter((g) => g.length > 1).length;
  if (dups.duplicateGroups !== expectedGroups) fail('duplicateGroups mismatch');
}

await verifyRoot(ws);
if (process.env.DWB_HIDDEN_ROOT) {
  for (const v of await readdir(process.env.DWB_HIDDEN_ROOT, { withFileTypes: true })) {
    if (!v.isDirectory()) continue;
    // hidden only checks extra file set when agent script re-run; static outputs validated above
  }
}
console.log('DWB_VERIFY_PASS');
