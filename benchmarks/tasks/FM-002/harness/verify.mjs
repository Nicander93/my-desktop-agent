#!/usr/bin/env node
/**
 * FM-002 harness：校验 dry-run 计划、manifest、rollback；input 不得改动。
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`DWB_VERIFY_FAIL: ${msg}`);
  process.exit(1);
}

const MONTH = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function parseDateFromName(name, fallback) {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\s+(\d{4})\b/i.exec(name.toLowerCase());
  if (!m) return fallback;
  return `${m[3]}-${MONTH[m[1].toLowerCase()]}-${String(Number(m[2])).padStart(2, '0')}`;
}

function slugify(baseName) {
  let s = baseName.replace(/\s*\(copy\)\s*$/i, '').replace(/\s*\(\d+\)\s*$/i, '');
  s = s.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\s+\d{4}\b/gi, ' ');
  s = s.replace(/\.[^.]+$/, '').trim().toLowerCase().replace(/\s+/g, '_');
  return s.replace(/[^a-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'file';
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

async function expectedPlan(rules) {
  const inbox = join(workspace, rules.sourceDir);
  const names = (await readdir(inbox)).sort();
  const used = new Set();
  const plan = [];
  let seq = rules.sequenceStart ?? 1;
  const width = rules.sequenceWidth ?? 3;
  for (const name of names) {
    const date = parseDateFromName(name, rules.fallbackDate);
    const slug = slugify(name);
    const ext = extOf(name);
    let status = 'ok';
    let reason = 'matched_rules';
    let target = '';
    let tries = 0;
    while (tries < 100) {
      target = `${date}_${String(seq).padStart(width, '0')}_${slug}.${ext}`;
      if (!used.has(target)) break;
      seq += 1;
      tries += 1;
      status = 'conflict_resolved';
      reason = 'target_exists_bumped_seq';
    }
    if (tries >= 100) {
      plan.push({ from: name, to: null, status: 'skip', reason: 'could_not_resolve' });
      continue;
    }
    used.add(target);
    plan.push({ from: name, to: target, status, reason });
    seq += 1;
  }
  return plan;
}

async function assertInputUnchanged() {
  const fixtureInbox = join(taskDir, 'fixture/input/inbox');
  const wsInbox = join(workspace, 'input/inbox');
  const fixtureNames = (await readdir(fixtureInbox)).sort();
  const wsNames = (await readdir(wsInbox)).sort();
  if (fixtureNames.join('|') !== wsNames.join('|')) fail('inbox file list changed');
  for (const name of fixtureNames) {
    const a = await readFile(join(fixtureInbox, name));
    const b = await readFile(join(wsInbox, name));
    if (!a.equals(b)) fail(`inbox file modified: ${name}`);
  }
  const rulesA = await readFile(join(taskDir, 'fixture/input/rename-rules.json'));
  const rulesB = await readFile(join(workspace, 'input/rename-rules.json'));
  if (!rulesA.equals(rulesB)) fail('rename-rules.json modified');
}

await assertInputUnchanged();
const rules = JSON.parse(await readFile(join(workspace, 'input/rename-rules.json'), 'utf8'));
const expected = await expectedPlan(rules);

const planDoc = JSON.parse(await readFile(join(workspace, 'output/rename-plan.json'), 'utf8'));
if (planDoc.dryRun !== true) fail('rename-plan.json must set dryRun:true');
const entries = planDoc.entries ?? planDoc.plan ?? planDoc.renames;
if (!Array.isArray(entries)) fail('rename-plan.json missing entries array');
if (entries.length !== expected.length) fail(`plan entry count ${entries.length} != expected ${expected.length}`);

const targets = new Set();
for (let i = 0; i < expected.length; i += 1) {
  const exp = expected[i];
  const got = entries[i];
  if (got.from !== exp.from) fail(`plan[${i}].from mismatch`);
  if (got.to !== exp.to) fail(`plan[${i}].to=${got.to} expected ${exp.to}`);
  if (got.to) {
    if (targets.has(got.to)) fail(`duplicate target in plan: ${got.to}`);
    targets.add(got.to);
  }
}

const manifest = JSON.parse(await readFile(join(workspace, 'output/manifest.json'), 'utf8'));
if (manifest.dryRun !== true) fail('manifest.json must set dryRun:true');
const okEntries = entries.filter((e) => e.to);
if (manifest.fileCount !== okEntries.length) fail('manifest.fileCount mismatch');
if ((manifest.files ?? []).length !== okEntries.length) fail('manifest.files length mismatch');

const inbox = join(workspace, rules.sourceDir);
for (const row of manifest.files ?? []) {
  const buf = await readFile(join(inbox, row.from));
  if (row.sha256 !== sha256(buf)) fail(`manifest sha256 mismatch for ${row.from}`);
  if (row.sizeBytes !== buf.length) fail(`manifest size mismatch for ${row.from}`);
  if (row.to !== entries.find((e) => e.from === row.from)?.to) fail(`manifest.to mismatch for ${row.from}`);
}

const rollback = JSON.parse(await readFile(join(workspace, 'output/rollback.json'), 'utf8'));
const ops = rollback.operations ?? rollback.entries;
if (!Array.isArray(ops) || ops.length !== okEntries.length) fail('rollback.operations length mismatch');
for (const e of okEntries) {
  const op = ops.find((o) => o.from === e.to && o.to === e.from);
  if (!op) fail(`rollback missing inverse for ${e.from} -> ${e.to}`);
}

console.log('DWB_VERIFY_PASS');
