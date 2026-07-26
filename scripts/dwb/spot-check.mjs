#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = join(REPO, 'benchmarks/tasks');
const checks = [
  { id: 'PP-002', pass: 'reference/workspace', faults: ['skip-warnings', 'wrong-folder'] },
  { id: 'FM-001', pass: 'reference/workspace', faults: ['merged-types', 'deleted-file'] },
  { id: 'DP-003', pass: 'reference/workspace', faults: ['no-failed', 'bad-csv'] },
  { id: 'BW-002', pass: 'reference/workspace', faults: ['mismatch', 'short-ppt'] },
  { id: 'IW-002', pass: 'reference/workspace', faults: ['no-dedup', 'wrong-sort'] },
];

async function runVerify(taskId, workspaceRel) {
  const ws = join(ROOT, taskId, workspaceRel);
  const r = spawnSync(process.execPath, [join(ROOT, taskId, 'harness/verify.mjs')], {
    cwd: ws,
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

let ok = true;
for (const c of checks) {
  const pass = await runVerify(c.id, c.pass);
  const passOk = pass.code === 0 && pass.out.includes('DWB_VERIFY_PASS');
  console.log(`${c.id} PASS: ${passOk ? 'OK' : 'FAIL'} ${passOk ? '' : pass.out.trim()}`);
  if (!passOk) ok = false;
  for (const f of c.faults) {
    const fail = await runVerify(c.id, `faults/${f}`);
    const failOk = fail.code !== 0 && fail.out.includes('DWB_VERIFY_FAIL');
    console.log(`  fault ${f}: ${failOk ? 'OK (failed as expected)' : 'BAD ' + fail.out.trim()}`);
    if (!failOk) ok = false;
  }
}
process.exit(ok ? 0 : 1);
