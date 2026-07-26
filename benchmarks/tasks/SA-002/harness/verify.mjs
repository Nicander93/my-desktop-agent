#!/usr/bin/env node
/**
 * SA-002 harness：时间线、证据引用、事实/推断区分。
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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

async function hashTree(rel) {
  const base = join(workspace, rel);
  const names = await readdir(base, { withFileTypes: true });
  const parts = [];
  for (const e of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isFile()) {
      const buf = await readFile(join(base, e.name));
      parts.push(`${e.name}:${createHash('sha256').update(buf).digest('hex')}`);
    }
  }
  return parts.join('|');
}

const logs = {
  app: await readFile(join(workspace, 'input/logs/app.log'), 'utf8'),
  access: await readFile(join(workspace, 'input/logs/access.log'), 'utf8'),
};
const events = await readFile(join(workspace, 'input/events.json'), 'utf8');

const fixtureLogs = await hashTree('input/logs');
const expectedLogs = await (async () => {
  const base = join(taskDir, 'fixture/input/logs');
  const names = await readdir(base);
  const parts = [];
  for (const n of names.sort()) {
    const buf = await readFile(join(base, n));
    parts.push(`${n}:${createHash('sha256').update(buf).digest('hex')}`);
  }
  return parts.join('|');
})();
if (fixtureLogs !== expectedLogs) fail('input/logs modified');

const fixtureEvents = await readFile(join(taskDir, 'fixture/input/events.json'), 'utf8');
if (fixtureEvents !== events) fail('input/events.json modified');

const report = await readFile(join(workspace, 'output/incident-report.md'), 'utf8');
if (!report.includes('## Facts')) fail('incident-report.md missing ## Facts');
if (!report.includes('## Inferences')) fail('incident-report.md missing ## Inferences');
if (!/pool exhausted/i.test(report)) fail('report must mention pool exhausted fact');

const timelineText = await readFile(join(workspace, 'output/timeline.csv'), 'utf8');
const tlines = timelineText.replace(/\r\n/g, '\n').trim().split('\n');
const theaders = splitCsvLine(tlines[0]).map((h) => h.toLowerCase());
for (const h of ['timestamp', 'source', 'event_type', 'description', 'evidence_id']) {
  if (!theaders.includes(h)) fail(`timeline.csv missing ${h}`);
}
const tidx = Object.fromEntries(theaders.map((h, i) => [h, i]));
const trows = tlines.slice(1).filter(Boolean).map(splitCsvLine);
if (trows.length < 4) fail('timeline needs >=4 events');

let prev = '';
for (const row of trows) {
  const ts = row[tidx.timestamp];
  if (prev && ts < prev) fail('timeline not sorted ascending');
  prev = ts;
}

const requiredEvidence = [
  { id: 'E001', needle: 'deploy complete', source: 'app' },
  { id: 'E002', needle: '503', source: 'app' },
  { id: 'E003', needle: 'pool exhausted', source: 'app' },
];

for (const req of requiredEvidence) {
  const row = trows.find((r) => (r[tidx.evidence_id] ?? '') === req.id);
  if (!row) fail(`timeline missing ${req.id}`);
  const hay = logs[req.source] ?? logs.app;
  if (!hay.includes(req.needle)) fail(`evidence ${req.id} needle not in logs`);
  if (!row[tidx.description].toLowerCase().includes(req.needle.split(' ')[0].toLowerCase())) {
    fail(`timeline description for ${req.id} does not match log event`);
  }
}

const evDoc = JSON.parse(await readFile(join(workspace, 'output/evidence.json'), 'utf8'));
if (!Array.isArray(evDoc.facts) || evDoc.facts.length < 2) fail('evidence.json facts too few');
if (!Array.isArray(evDoc.inferences) || evDoc.inferences.length < 1) fail('evidence.json inferences required');
if (!evDoc.evidence || typeof evDoc.evidence !== 'object') fail('evidence map missing');

for (const f of evDoc.facts) {
  if (!f.evidence_id || !evDoc.evidence[f.evidence_id]) fail(`fact missing evidence map ${f.evidence_id}`);
}
for (const inf of evDoc.inferences) {
  if (!inf.based_on || !Array.isArray(inf.based_on) || inf.based_on.length === 0) {
    fail('each inference needs based_on evidence ids');
  }
}

console.log('DWB_VERIFY_PASS');
