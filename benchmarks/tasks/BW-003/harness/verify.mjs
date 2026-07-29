#!/usr/bin/env node
/** BW-003 harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipXmlText } from '../../../lib/officeZipText.mjs';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`DWB_VERIFY_FAIL: ${message}`);
  process.exit(1);
}

async function assertInputUnchanged(relPaths) {
  for (const rel of relPaths) {
    const base = await readFile(join(taskDir, 'fixture', rel));
    const cur = await readFile(join(workspace, rel));
    if (!base.equals(cur)) fail(`protected input modified: ${rel}`);
  }
}

async function main() {
  await assertInputUnchanged(['input/contracts/c1.txt']);
  const sheet = zipXmlText(await readFile(join(workspace, 'output/contract-register.xlsx')));
  if (!sheet.includes('Acme Corp') || !/(50000|50,000)/.test(sheet)) fail('c1 fields');
  const ev = JSON.parse(await readFile(join(workspace, 'output/evidence.json'), 'utf8'));
  const partyFile = evidenceFile(ev, 'party');
  if (!partyFile) fail('evidence party');
  const notes = await readFile(join(workspace, 'output/review-notes.md'), 'utf8');
  if (!notes.includes('c2') || !notes.toLowerCase().includes('missing')) fail('c2 missing noted');
}

/** 兼容 {"party":{"file":"c1.txt"}} 与 {"party":{"c1.txt":{"file":"c1.txt"}}} */
function evidenceFile(ev, field) {
  const node = ev?.[field] ?? ev?.[field.toLowerCase()];
  if (!node || typeof node !== 'object') return undefined;
  if (typeof node.file === 'string') return node.file;
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object' && typeof value.file === 'string') return value.file;
  }
  return undefined;
}
await main(); console.log('DWB_VERIFY_PASS');
