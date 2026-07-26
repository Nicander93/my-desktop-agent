#!/usr/bin/env node
/**
 * KW-002 harness：校验 evidence ID、禁止臆造 owner/date、章节结构。
 */
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function parseEvidenceBlocks(text) {
  const blocks = new Map();
  const re = /\[(E\d{3})\][^\n]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.set(m[1], m[0]);
  }
  return blocks;
}

function lineHas(text, needle) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

const transcriptPath = join(workspace, 'input/transcript.md');
const baseline = await readFile(join(taskDir, 'fixture/input/transcript.md'), 'utf8');
const transcript = await readFile(transcriptPath, 'utf8');
if (baseline !== transcript) fail('input/transcript.md modified');

const evidence = parseEvidenceBlocks(transcript);
if (evidence.size < 8) fail('transcript evidence parse failed');

const minutes = await readFile(join(workspace, 'output/minutes.md'), 'utf8');
for (const section of ['Summary', 'Decisions', 'Discussion', 'Open Items']) {
  if (!minutes.includes(section)) fail(`minutes.md missing section: ${section}`);
}
if (!minutes.includes('[E003]') && !minutes.includes('E003')) fail('Decisions must reference E003');
if (!/REST/i.test(minutes)) fail('minutes must mention REST decision');

const csvText = await readFile(join(workspace, 'output/actions.csv'), 'utf8');
const lines = csvText.replace(/\r\n/g, '\n').trim().split('\n');
const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
const required = ['action_id', 'description', 'owner', 'due_date', 'evidence_ids'];
for (const h of required) {
  if (!headers.includes(h)) fail(`actions.csv missing column ${h}`);
}
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const rows = lines.slice(1).filter(Boolean).map(splitCsvLine);
if (rows.length < 2) fail('actions.csv needs at least 2 action rows');

const mustHave = [
  { owner: 'Charlie', due: '2024-03-15', evidence: 'E005', keyword: 'security' },
  { owner: 'Bob', due: 'TBD', evidence: 'E004', keyword: 'doc' },
];

for (const need of mustHave) {
  const row = rows.find((r) => {
    const ids = (r[idx.evidence_ids] ?? '').split(';').map((s) => s.trim());
    return ids.includes(need.evidence);
  });
  if (!row) fail(`missing action for evidence ${need.evidence}`);
  if ((row[idx.owner] ?? '') !== need.owner) fail(`owner for ${need.evidence} must be ${need.owner}`);
  if ((row[idx.due_date] ?? '') !== need.due) fail(`due_date for ${need.evidence} must be ${need.due}`);
  if (!lineHas(row[idx.description] ?? '', need.keyword)) fail(`description for ${need.evidence} too vague`);
}

for (const row of rows) {
  const ids = (row[idx.evidence_ids] ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) fail('each action needs evidence_ids');
  for (const id of ids) {
    if (!evidence.has(id)) fail(`unknown evidence id ${id}`);
  }
  const owner = row[idx.owner] ?? '';
  const due = row[idx.due_date] ?? '';
  const joined = ids.map((id) => evidence.get(id)).join('\n');
  if (owner && !lineHas(joined, owner)) fail(`owner ${owner} not supported by cited evidence`);
  if (due && due !== 'TBD' && !joined.includes(due)) fail(`due_date ${due} not found in cited evidence`);
}

const forbiddenOwners = ['Eve', 'Frank', 'Unknown'];
for (const row of rows) {
  const owner = row[idx.owner] ?? '';
  if (forbiddenOwners.includes(owner)) fail(`fabricated owner: ${owner}`);
}

console.log('DWB_VERIFY_PASS');
