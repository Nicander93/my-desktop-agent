#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m) => { console.error('DWB_VERIFY_FAIL: ' + m); process.exit(1); };

const REQUIRED_FACTS = ['FACT-001','FACT-002','FACT-003','FACT-004'];
const SOURCE_FILES = ['product-overview.md','meeting-notes.txt','roadmap.md'];

const brief = await readFile(join(ws, 'brief.md'), 'utf8');
for (const h of ['## Summary','## Key Facts','## Action Items']) if (!brief.includes(h)) fail('missing section ' + h);
for (const f of REQUIRED_FACTS) if (!brief.includes(f)) fail('brief missing ' + f);
if (brief.includes('FACT-005')) fail('hallucinated fact');

const src = JSON.parse(await readFile(join(ws, 'sources.json'), 'utf8'));
if (!Array.isArray(src.facts) || src.facts.length < 4) fail('sources.facts incomplete');
for (const id of REQUIRED_FACTS) {
  const row = src.facts.find((x) => x.id === id);
  if (!row || !row.sources?.length) fail('sources missing ' + id);
  for (const s of row.sources) if (!SOURCE_FILES.includes(s)) fail('invalid source file ' + s);
}
if (!src.actionItems?.some((a) => /pricing/i.test(a.text))) fail('missing pricing action item');

for (const f of SOURCE_FILES) {
  const base = await readFile(join(taskDir, 'fixture/sources', f));
  const cur = await readFile(join(ws, 'sources', f));
  if (!base.equals(cur)) fail('source modified ' + f);
}
console.log('DWB_VERIFY_PASS');
