#!/usr/bin/env node
/**
 * Bootstrap Wave 1 DWB tasks: reference workspaces, faults, hidden fixtures smoke.
 */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const tasks = ['FM-002', 'SD-001', 'OA-001', 'KW-002', 'SA-002'];

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
}

async function setupTask(id) {
  const taskDir = join(root, 'benchmarks/tasks', id);
  const ws = join(taskDir, 'reference/workspace');
  await rm(ws, { recursive: true, force: true });
  await copyDir(join(taskDir, 'fixture'), ws);

  if (id === 'SD-001') {
    await cp(
      join(taskDir, 'reference/fixture/src/pricing.js'),
      join(ws, 'src/pricing.js'),
      { force: true },
    );
  } else {
    const gen = join(taskDir, 'reference/generate.mjs');
    const run = spawnSync(process.execPath, [gen, ws], { encoding: 'utf8' });
    if (run.status !== 0) {
      console.error(run.stderr || run.stdout);
      throw new Error(`${id} generate failed`);
    }
  }

  const verify = spawnSync(process.execPath, [join(taskDir, 'harness/verify.mjs')], {
    cwd: ws,
    encoding: 'utf8',
  });
  const pass = verify.status === 0 && (verify.stdout || '').includes('DWB_VERIFY_PASS');
  console.log(`${id} reference: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) {
    console.error(verify.stdout);
    console.error(verify.stderr);
  }

  for (const fault of ['fault-a', 'fault-b']) {
    const fws = join(taskDir, 'faults', fault, 'workspace');
    await rm(fws, { recursive: true, force: true });
    await copyDir(ws, fws);
  }
}

async function setupFaults(id) {
  const taskDir = join(root, 'benchmarks/tasks', id);
  if (id === 'FM-002') {
    const plan = JSON.parse(await readFile(join(taskDir, 'reference/workspace/output/rename-plan.json'), 'utf8'));
    plan.entries[0].to = 'WRONG_NAME.jpg';
    await writeFile(join(taskDir, 'faults/fault-a/workspace/output/rename-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    plan.entries[0].to = plan.entries[1].to;
    await writeFile(join(taskDir, 'faults/fault-b/workspace/output/rename-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  }
  if (id === 'SD-001') {
    await cp(join(taskDir, 'fixture/src/pricing.js'), join(taskDir, 'faults/fault-a/workspace/src/pricing.js'), { force: true });
    const broken = `import { itemUnitPrice, bulkRate } from './discount.js';\nimport { multiply, roundMoney } from './money.js';\nexport function calculateLineTotal(line) {\n  const unit = itemUnitPrice(line.sku, line.unitPrice);\n  let subtotal = multiply(unit, line.quantity);\n  subtotal = roundMoney(subtotal * bulkRate());\n  return roundMoney(subtotal);\n}\nexport function sumLines(lines) {\n  return roundMoney(lines.reduce((acc, line) => acc + calculateLineTotal(line), 0));\n}\n`;
    await writeFile(join(taskDir, 'faults/fault-b/workspace/src/pricing.js'), broken);
  }
  if (id === 'OA-001') {
    const summary = JSON.parse(await readFile(join(taskDir, 'reference/workspace/output/summary.json'), 'utf8'));
    summary.totalRevenue = 1;
    await writeFile(join(taskDir, 'faults/fault-a/workspace/output/summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    summary.sheets = ['OnlyOne'];
    await writeFile(join(taskDir, 'faults/fault-b/workspace/output/summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (id === 'KW-002') {
    const csv = await readFile(join(taskDir, 'reference/workspace/output/actions.csv'), 'utf8');
    await writeFile(join(taskDir, 'faults/fault-a/workspace/output/actions.csv'), csv.replace('Charlie', 'Eve'));
    await writeFile(join(taskDir, 'faults/fault-b/workspace/output/actions.csv'), csv.replace('2024-03-15', '2024-12-31'));
  }
  if (id === 'SA-002') {
    const tl = await readFile(join(taskDir, 'reference/workspace/output/timeline.csv'), 'utf8');
    await writeFile(join(taskDir, 'faults/fault-a/workspace/output/timeline.csv'), tl.replace('E003', 'E999'));
    const ev = JSON.parse(await readFile(join(taskDir, 'reference/workspace/output/evidence.json'), 'utf8'));
    ev.inferences = [];
    await writeFile(join(taskDir, 'faults/fault-b/workspace/output/evidence.json'), `${JSON.stringify(ev, null, 2)}\n`);
  }

  for (const fault of ['fault-a', 'fault-b']) {
    const fws = join(taskDir, 'faults', fault, 'workspace');
    const verify = spawnSync(process.execPath, [join(taskDir, 'harness/verify.mjs')], {
      cwd: fws,
      encoding: 'utf8',
    });
    const fail = verify.status !== 0 || !(verify.stdout || '').includes('DWB_VERIFY_PASS');
    console.log(`${id} ${fault}: ${fail ? 'FAIL (expected)' : 'UNEXPECTED PASS'}`);
  }
}

async function setupHidden(id) {
  const hiddenBase = join(root, 'benchmarks/hidden-fixtures', id);
  if (id === 'FM-002') {
    const dest = join(hiddenBase, 'extra-inbox/input/inbox');
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'photo feb 1 2024.jpg'), 'hidden photo\n');
  }
  if (id === 'SD-001') {
    const dest = join(hiddenBase, 'stricter-bulk/input/config');
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'discounts.json'), `${JSON.stringify({
      bulkThreshold: 5,
      bulkRate: 0.85,
      itemDiscounts: { WIDGET: 0.95 },
    }, null, 2)}\n`);
  }
  if (id === 'OA-001') {
    const dest = join(hiddenBase, 'extra-region/input');
    await mkdir(dest, { recursive: true });
    const csv = await readFile(join(root, 'benchmarks/tasks/OA-001/fixture/input/sales.csv'), 'utf8');
    await writeFile(join(dest, 'sales.csv'), `${csv.trim()}\nCentral,Epsilon,1,100,2024-03-01\n`);
  }
  if (id === 'KW-002') {
    const dest = join(hiddenBase, 'extra-action/input');
    await mkdir(dest, { recursive: true });
    const md = await readFile(join(root, 'benchmarks/tasks/KW-002/fixture/input/transcript.md'), 'utf8');
    await writeFile(join(dest, 'transcript.md'), `${md}\n[E011] **Erin**: Action — Erin will send the budget sheet by **2024-03-20**.\n`);
  }
  if (id === 'SA-002') {
    const dest = join(hiddenBase, 'noise-log/input/logs');
    await mkdir(dest, { recursive: true });
    await cp(join(root, 'benchmarks/tasks/SA-002/fixture/input/logs/app.log'), join(dest, 'app.log'));
    await cp(join(root, 'benchmarks/tasks/SA-002/fixture/input/logs/access.log'), join(dest, 'access.log'));
    await writeFile(join(dest, 'noise.log'), '2024-06-18T14:00:00Z DEBUG unrelated heartbeat\n');
    await cp(join(root, 'benchmarks/tasks/SA-002/fixture/input/events.json'), join(hiddenBase, 'noise-log/input/events.json'));
  }
}

for (const id of tasks) {
  await setupTask(id);
  await setupFaults(id);
  await setupHidden(id);
}

console.log('bootstrap complete');
