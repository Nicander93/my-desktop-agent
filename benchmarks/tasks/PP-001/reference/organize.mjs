#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const src = join(root, 'downloads');
const out = join(root, 'organized');

function category(ext) {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'documents';
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(e)) return 'images';
  if (['.csv', '.json'].includes(e)) return 'data';
  if (['.txt', '.md'].includes(e)) return 'text';
  if (e === '.zip') return 'archives';
  return 'other';
}

const entries = (await readdir(src)).filter((f) => !f.startsWith('.'));
const manifest = [];
const hashMap = new Map();

for (const name of entries) {
  const data = await readFile(join(src, name));
  const hash = createHash('sha256').update(data).digest('hex');
  const cat = category(extname(name));
  const destDir = join(out, cat);
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, name);
  await copyFile(join(src, name), dest);
  manifest.push({ name, category: cat, sha256: hash, organizedPath: `organized/${cat}/${name}` });
  if (!hashMap.has(hash)) hashMap.set(hash, []);
  hashMap.get(hash).push(name);
}

const duplicates = [...hashMap.entries()].filter(([, g]) => g.length > 1).map(([hash, files]) => ({ sha256: hash, files }));
await writeFile(join(root, 'manifest.json'), JSON.stringify({ dryRun: true, fileCount: manifest.length, files: manifest }, null, 2) + '\n');
await writeFile(join(root, 'duplicates.json'), JSON.stringify({ duplicateGroups: duplicates.length, groups: duplicates }, null, 2) + '\n');
