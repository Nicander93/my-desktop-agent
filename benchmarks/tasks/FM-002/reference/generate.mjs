#!/usr/bin/env node
/**
 * FM-002 reference：按 rename-rules 生成 dry-run 产物（不改动 inbox）。
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();

const rules = JSON.parse(await readFile(join(root, 'input/rename-rules.json'), 'utf8'));
const inbox = join(root, rules.sourceDir);

const MONTH = rules.monthMap ?? {};

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function parseDateFromName(name) {
  const lower = name.toLowerCase();
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\s+(\d{4})\b/i.exec(lower);
  if (!m) return rules.fallbackDate;
  const mm = MONTH[m[1].toLowerCase()] ?? '01';
  const dd = String(Number(m[2])).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function slugify(baseName, rulesObj) {
  let s = baseName;
  if (rulesObj.slugRules?.stripCopySuffix) {
    s = s.replace(/\s*\(copy\)\s*$/i, '');
    s = s.replace(/\s*\(\d+\)\s*$/i, '');
  }
  s = s.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\s+\d{4}\b/gi, ' ');
  s = s.replace(/\.[^.]+$/, '');
  s = s.trim().replace(/\s+/g, ' ');
  if (rulesObj.slugRules?.lowercase) s = s.toLowerCase();
  if (rulesObj.slugRules?.replaceSpaces) s = s.replace(/\s+/g, '_');
  s = s.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return s || 'file';
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

const entries = await readdir(inbox);
const files = [];
for (const name of entries.sort()) {
  const buf = await readFile(join(inbox, name));
  files.push({ name, buf, size: buf.length, hash: sha256(buf) });
}

const usedTargets = new Set();
const plan = [];
let seqCounter = rules.sequenceStart ?? 1;
const width = rules.sequenceWidth ?? 3;

for (const file of files) {
  const date = parseDateFromName(file.name);
  const ext = extOf(file.name);
  const slug = slugify(file.name, rules);
  let status = 'ok';
  let reason = '';
  let target = '';
  let attempts = 0;
  while (attempts < 100) {
    const seq = String(seqCounter).padStart(width, '0');
    target = `${date}_${seq}_${slug}.${ext}`;
    if (!usedTargets.has(target)) break;
    seqCounter += 1;
    attempts += 1;
    status = 'conflict_resolved';
    reason = 'target_exists_bumped_seq';
  }
  if (attempts >= 100) {
    plan.push({ from: file.name, to: null, status: 'skip', reason: 'could_not_resolve' });
    continue;
  }
  usedTargets.add(target);
  plan.push({ from: file.name, to: target, status, reason: reason || 'matched_rules' });
  seqCounter += 1;
}

const manifestFiles = plan.filter((p) => p.to).map((p) => {
  const src = files.find((f) => f.name === p.from);
  return { from: p.from, to: p.to, sha256: src.hash, sizeBytes: src.size };
});

const rollback = {
  operations: plan.filter((p) => p.to).map((p) => ({ from: p.to, to: p.from })),
};

await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output/rename-plan.json'), `${JSON.stringify({ dryRun: true, entries: plan }, null, 2)}\n`);
await writeFile(join(root, 'output/manifest.json'), `${JSON.stringify({ dryRun: true, fileCount: manifestFiles.length, files: manifestFiles }, null, 2)}\n`);
await writeFile(join(root, 'output/rollback.json'), `${JSON.stringify(rollback, null, 2)}\n`);

console.log('FM-002 reference outputs written');
