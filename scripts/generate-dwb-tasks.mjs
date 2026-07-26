#!/usr/bin/env node
/**
 * 生成 DWB 36 任务中尚未存在的可跑任务（跳过已有目录）。
 * 每个任务：task.json + metadata + fixture + harness(含 expected) + reference + faults + hidden。
 */
import { mkdir, writeFile, access, readFile, cp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from '../packages/agent-eval/node_modules/yaml/dist/index.js';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = parseYaml(await readFile(join(root, 'docs/eval/dwb/04-task-catalog.yaml'), 'utf8'));

const PROFILE = {
  'personal-productivity': 'file-organizing',
  'knowledge-work': 'coding',
  'data-processing': 'coding',
  'software-development': 'coding',
  'office-automation': 'office',
  'file-management': 'file-organizing',
  'media-processing': 'coding',
  'internet-workflow': 'coding',
  'communication': 'coding',
  'business-workflow': 'coding',
  'system-administration': 'coding',
  'cross-application': 'coding',
};

const CAPS = {
  coding: ['read-project', 'edit-code', 'run-tests'],
  office: ['inspect-spreadsheet', 'transform-data', 'create-charts', 'validate-spreadsheet', 'create-pptx', 'validate-pptx'],
  'file-organizing': ['read-project', 'edit-code'],
};

function artifactPaths(artifacts) {
  return artifacts.map((a) => (a.endsWith('/') ? a : (a.includes('/') ? a : `output/${a}`)));
}

function requiredFiles(artifacts) {
  return artifactPaths(artifacts).filter((a) => !a.endsWith('/'));
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function buildExpected(task, domainId) {
  const id = task.id;
  const arts = requiredFiles(task.expected_artifacts);
  const base = {
    taskId: id,
    domain: domainId,
    checks: task.core_checks,
    required: arts,
  };

  // Domain-specific expected payloads agents must match structurally
  switch (id) {
    case 'FM-002':
      return {
        ...base,
        renamePlan: [
          { from: 'img_1.JPG', to: '2024-01-01_001.jpg' },
          { from: 'img_2.JPG', to: '2024-01-01_002.jpg' },
          { from: 'notes.txt', to: '2024-01-02_001.txt' },
        ],
        conflictPolicy: 'skip',
        dryRunOnly: true,
      };
    case 'KW-002':
      return {
        ...base,
        requiredActionIds: ['A1', 'A2'],
        forbiddenOwners: ['张三丰', 'Unknown Person'],
        actions: [
          { id: 'A1', owner: 'Alice', due: '2024-03-01', text: 'Send budget draft' },
          { id: 'A2', owner: 'Bob', due: '', text: 'Collect vendor quotes' },
        ],
      };
    case 'SA-002':
      return {
        ...base,
        rootCauseMustInclude: 'connection pool exhausted',
        evidenceIds: ['E1', 'E2', 'E3'],
        factLines: 3,
      };
    case 'SD-001':
      return { ...base, testCommand: 'node --test', mustPass: true };
    case 'OA-001':
      return { ...base, sheets: ['Source', 'Cleaned', 'Summary'], minCharts: 1, totalSales: 1500 };
    case 'PP-001':
      return {
        ...base,
        categories: ['docs', 'images', 'archives', 'other'],
        duplicatePairs: [['a.pdf', 'a_copy.pdf']],
        deleteForbidden: true,
      };
    default:
      return {
        ...base,
        mustContain: task.expected_artifacts.map((a) => a.replace(/\/$/, '')),
        fingerprint: sha(`${id}:${task.user_goal}`),
      };
  }
}

function harnessSource(taskId) {
  return `#!/usr/bin/env node
import { readFile, access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = process.cwd();
const expected = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'expected.json'), 'utf8'));

function fail(msg) { console.error('DWB_VERIFY_FAIL: ' + msg); process.exit(1); }
async function mustExist(rel) {
  try { await access(join(workspace, rel), constants.F_OK); } catch { fail('missing ' + rel); }
}

for (const rel of expected.required ?? []) await mustExist(rel);

async function readJson(rel) {
  return JSON.parse(await readFile(join(workspace, rel), 'utf8'));
}

async function fileText(rel) {
  return readFile(join(workspace, rel), 'utf8');
}

const id = expected.taskId;

if (id === 'FM-002') {
  const plan = await readJson('output/rename-plan.json');
  const manifest = await readJson('output/manifest.json');
  const rollback = await readJson('output/rollback.json');
  if (!Array.isArray(plan.operations) || plan.operations.length < 3) fail('rename-plan operations incomplete');
  for (const op of expected.renamePlan) {
    if (!plan.operations.some((x) => x.from === op.from && x.to === op.to)) fail('missing planned rename ' + op.from);
  }
  if (plan.dryRun !== true && expected.dryRunOnly) fail('dryRun must be true');
  if (!manifest.files || !rollback.operations) fail('manifest/rollback incomplete');
  // input files must still exist with original names
  for (const op of expected.renamePlan) await mustExist('input/' + op.from);
}

else if (id === 'KW-002') {
  const actionsText = await fileText('output/actions.csv');
  const minutes = await fileText('output/minutes.md');
  for (const action of expected.actions) {
    if (!actionsText.includes(action.id)) fail('missing action ' + action.id);
    if (action.owner && !actionsText.includes(action.owner)) fail('missing owner ' + action.owner);
  }
  for (const bad of expected.forbiddenOwners) {
    if (actionsText.includes(bad) || minutes.includes(bad)) fail('fabricated owner ' + bad);
  }
  if (!minutes.toLowerCase().includes('decision') && !minutes.includes('决策')) fail('minutes missing decisions section');
}

else if (id === 'SA-002') {
  const report = await fileText('output/incident-report.md');
  const timeline = await fileText('output/timeline.csv');
  const evidence = await readJson('output/evidence.json');
  if (!report.toLowerCase().includes(expected.rootCauseMustInclude)) fail('root cause missing');
  if (!report.includes('FACT') || !report.includes('INFERENCE')) fail('must distinguish FACT vs INFERENCE');
  for (const eid of expected.evidenceIds) {
    if (!JSON.stringify(evidence).includes(eid)) fail('missing evidence ' + eid);
  }
  if ((timeline.match(/\\n/g) || []).length < 3) fail('timeline too short');
}

else if (id === 'SD-001') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['--test'], { cwd: workspace, encoding: 'utf8' });
  if (r.status !== 0) fail('tests failed: ' + (r.stderr || r.stdout).slice(-400));
}

else if (id === 'OA-001') {
  const summary = await readJson('output/summary.json');
  await mustExist('output/dashboard.xlsx');
  if (summary.totalSales !== expected.totalSales) fail('totalSales mismatch');
  if (!Array.isArray(summary.sheets) || expected.sheets.some((s) => !summary.sheets.includes(s))) fail('sheets mismatch');
  if ((summary.chartCount ?? 0) < expected.minCharts) fail('chartCount too low');
  // zip signature
  const buf = await readFile(join(workspace, 'output/dashboard.xlsx'));
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) fail('dashboard.xlsx is not a zip/xlsx');
}

else if (id === 'PP-001') {
  const manifest = await readJson('output/manifest.json');
  const duplicates = await readJson('output/duplicates.json');
  await mustExist('output/organized');
  for (const cat of expected.categories) {
    if (!manifest.categories?.[cat] && !manifest[cat]) fail('missing category ' + cat);
  }
  if (!Array.isArray(duplicates.pairs) || duplicates.pairs.length < 1) fail('duplicates missing');
  // originals untouched
  await mustExist('input/a.pdf');
  await mustExist('input/a_copy.pdf');
}

else {
  // generic: required files exist + report.json fingerprint or status ok
  if (expected.required.some((r) => r.endsWith('report.json') || r === 'output/report.json')) {
    try {
      const report = await readJson(expected.required.find((r) => r.includes('report')) || 'output/report.json');
      if (report.ok !== true && report.status !== 'ok' && report.taskId !== id) {
        if (report.fingerprint && report.fingerprint !== expected.fingerprint) fail('fingerprint mismatch');
        if (!report.ok && report.status !== 'ok' && !report.taskId) fail('report.json missing ok/status/taskId');
      }
    } catch { /* some tasks use other primary artifacts */ }
  }
  // optional summary.md / markdown artifacts non-empty
  for (const rel of expected.required) {
    if (rel.endsWith('.md') || rel.endsWith('.csv') || rel.endsWith('.json')) {
      const st = await stat(join(workspace, rel));
      if (st.size < 8) fail(rel + ' too small');
    }
  }
}

// hidden root presence is optional; if set, ensure at least one variant dir exists
if (process.env.DWB_HIDDEN_ROOT) {
  const entries = await readdir(process.env.DWB_HIDDEN_ROOT).catch(() => []);
  if (entries.length === 0) fail('empty hidden fixtures');
}

console.log('DWB_VERIFY_PASS');
`;
}

function referenceOutputs(task, expected) {
  const files = {};
  const id = task.id;
  const req = requiredFiles(task.expected_artifacts);

  const ensure = (rel, content) => { files[rel] = content; };

  if (id === 'FM-002') {
    ensure('output/rename-plan.json', JSON.stringify({
      dryRun: true,
      operations: expected.renamePlan,
      conflictPolicy: 'skip',
    }, null, 2) + '\n');
    ensure('output/manifest.json', JSON.stringify({ files: expected.renamePlan.map((o) => o.from) }, null, 2) + '\n');
    ensure('output/rollback.json', JSON.stringify({ operations: expected.renamePlan.map((o) => ({ from: o.to, to: o.from })) }, null, 2) + '\n');
  } else if (id === 'KW-002') {
    ensure('output/minutes.md', `# Minutes\n\n## Decisions\n- Approve Q2 budget\n\n## Discussion\n- Vendor options unclear\n`);
    ensure('output/actions.csv', 'id,owner,due,text\nA1,Alice,2024-03-01,Send budget draft\nA2,Bob,,Collect vendor quotes\n');
  } else if (id === 'SA-002') {
    ensure('output/incident-report.md', `# Incident\n\nFACT: connection pool exhausted at 10:02\nINFERENCE: likely traffic spike\n\nRoot cause: connection pool exhausted\n`);
    ensure('output/timeline.csv', 'time,event\n10:00,warnings\n10:02,pool exhausted\n10:05,restarts\n');
    ensure('output/evidence.json', JSON.stringify({ items: [{ id: 'E1' }, { id: 'E2' }, { id: 'E3' }] }, null, 2) + '\n');
  } else if (id === 'OA-001') {
    ensure('output/summary.json', JSON.stringify({ totalSales: 1500, sheets: ['Source', 'Cleaned', 'Summary'], chartCount: 1 }, null, 2) + '\n');
    // minimal zip/xlsx (PK header + empty)
    ensure('output/dashboard.xlsx', Buffer.from('PK\u0003\u0004minimal-xlsx-placeholder-for-signature-check'));
  } else if (id === 'PP-001') {
    ensure('output/manifest.json', JSON.stringify({ categories: { docs: ['a.pdf'], images: ['pic.png'], archives: ['x.zip'], other: ['notes.txt'] } }, null, 2) + '\n');
    ensure('output/duplicates.json', JSON.stringify({ pairs: [['a.pdf', 'a_copy.pdf']] }, null, 2) + '\n');
    ensure('output/organized/.keep', '');
  } else if (id === 'SD-001') {
    // reference is fixed source tree, created separately in fixture copy
  } else {
    for (const rel of req) {
      if (rel.endsWith('.json')) {
        ensure(rel, JSON.stringify({ ok: true, taskId: id, fingerprint: expected.fingerprint, status: 'ok' }, null, 2) + '\n');
      } else if (rel.endsWith('.csv')) {
        ensure(rel, 'col1,col2\nv1,v2\n');
      } else if (rel.endsWith('.md')) {
        ensure(rel, `# ${task.title}\n\nStatus: ok\n\nTask: ${id}\n`);
      } else if (rel.endsWith('.xlsx') || rel.endsWith('.pptx')) {
        ensure(rel, Buffer.from('PK\u0003\u0004' + id));
      } else {
        ensure(rel, `ok:${id}\n`);
      }
    }
    // directory artifacts
    for (const a of task.expected_artifacts) {
      if (a.endsWith('/')) ensure(`output/${a}.keep`.replace('//', '/').replace('output/output/', 'output/'), '');
      if (a.endsWith('/')) ensure(`${a.startsWith('output/') ? a : 'output/' + a}.keep`, '');
    }
  }
  return files;
}

function fixtureFiles(task, domainId) {
  const id = task.id;
  const files = {};
  if (id === 'FM-002') {
    files['input/img_1.JPG'] = 'fake-jpg-1';
    files['input/img_2.JPG'] = 'fake-jpg-2';
    files['input/notes.txt'] = 'notes';
    files['input/README.txt'] = 'rename these files by date rules; dry-run first';
  } else if (id === 'KW-002') {
    files['input/transcript.md'] = `# Meeting [E0]\nAlice: We decide to approve Q2 budget. [A1] Alice will send budget draft by 2024-03-01.\nBob: I can collect vendor quotes [A2] but no deadline yet.\nCharlie: Someone should maybe follow up — owner unclear.\n`;
  } else if (id === 'SA-002') {
    files['input/app.log'] = `10:00 WARN pool high\n10:02 ERROR connection pool exhausted\n10:05 INFO restart\n`;
    files['input/system.log'] = `10:01 CPU ok\n10:02 many accept failures\n`;
    files['input/events.json'] = JSON.stringify([{ id: 'E1', t: '10:00' }, { id: 'E2', t: '10:02' }, { id: 'E3', t: '10:05' }], null, 2);
  } else if (id === 'OA-001') {
    files['input/sales.csv'] = 'region,product,amount\nEast,A,500\nWest,B,1000\n';
  } else if (id === 'PP-001') {
    files['input/a.pdf'] = '%PDF-a';
    files['input/a_copy.pdf'] = '%PDF-a';
    files['input/pic.png'] = 'png';
    files['input/x.zip'] = 'zip';
    files['input/notes.txt'] = 'txt';
  } else if (id === 'SD-001') {
    files['package.json'] = JSON.stringify({ name: 'sd-001', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n';
    files['src/math.js'] = 'export function add(a, b) { return a - b; }\nexport function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }\n';
    files['src/format.js'] = "export function money(n) { return '$' + Number(n).toFixed(1); }\n";
    files['test/math.test.js'] = "import test from 'node:test'; import assert from 'node:assert/strict'; import { add, clamp } from '../src/math.js';\ntest('add', () => assert.equal(add(2,3), 5));\ntest('clamp', () => assert.equal(clamp(10,0,5), 5));\n";
    files['test/format.test.js'] = "import test from 'node:test'; import assert from 'node:assert/strict'; import { money } from '../src/format.js';\ntest('money', () => assert.equal(money(2), '$2.00'));\n";
    files['ISSUE.md'] = 'add() returns difference; money() should use 2 decimal places.\n';
  } else {
    files['input/source.txt'] = `Task ${id}\nGoal: ${task.user_goal}\nDomain: ${domainId}\n`;
    files['input/data.csv'] = 'id,value\n1,10\n2,20\n';
    files['input/notes.md'] = `# Notes for ${id}\n\nProduce required artifacts under output/.\n`;
  }
  return files;
}

function promptFor(task) {
  const arts = task.expected_artifacts.map((a) => `- ${a.startsWith('output/') || a.endsWith('/') ? a : 'output/' + a}`).join('\n');
  return `${task.user_goal}\n\n请在工作区内完成任务，并生成：\n${arts}\n\n不要修改受保护的输入文件。通过与否由评测 harness 决定（工作区无判分脚本）。`;
}

async function writeTree(base, files) {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(base, rel);
    await mkdir(dirname(path), { recursive: true });
    if (Buffer.isBuffer(content)) await writeFile(path, content);
    else await writeFile(path, content, 'utf8');
  }
}

async function createTask(domain, task) {
  const taskDir = join(root, 'benchmarks/tasks', task.id);
  if (await exists(join(taskDir, 'task.json'))) {
    console.log('skip existing', task.id);
    return 'skipped';
  }
  const profile = PROFILE[domain.id] ?? 'coding';
  const expected = buildExpected(task, domain.id);
  const req = requiredFiles(task.expected_artifacts);
  const unchanged = Object.keys(fixtureFiles(task, domain.id))
    .filter((p) => p.startsWith('input/') || p.startsWith('test/') || p === 'package.json')
    .slice(0, 6);

  const taskJson = {
    schemaVersion: 1,
    id: task.id,
    version: '1.0.0',
    title: task.title,
    prompt: promptFor(task),
    profile,
    capabilities: CAPS[profile] ?? CAPS.coding,
    workflowId: 'inspect-implement-run-verify',
    suite: 'quality',
    tags: ['dwb', domain.id, task.difficulty],
    fixture: 'fixture',
    limits: { maxTurns: 30, timeoutMs: 900000, maxChangedFiles: 40 },
    verifier: {
      requiredFiles: req.length ? req : undefined,
      unchangedPaths: unchanged.length ? unchanged : undefined,
      commands: [{
        command: 'node',
        args: ['harness/verify.mjs'],
        resolveArgsFromTaskDir: true,
        expectedExitCode: 0,
        stdoutIncludes: ['DWB_VERIFY_PASS'],
        timeoutMs: 120000,
      }],
    },
  };

  const metadata = `benchmark: dwb
domain: ${domain.id}
difficulty:
  level: ${task.difficulty}
frequency: weekly
risk: medium
sourceType: synthesized-from-common-workflow
expectedArtifacts:
${task.expected_artifacts.map((a) => `  - ${a}`).join('\n')}
diagnostics: []
`;

  await mkdir(taskDir, { recursive: true });
  await writeFile(join(taskDir, 'task.json'), JSON.stringify(taskJson, null, 2) + '\n');
  await writeFile(join(taskDir, 'metadata.yaml'), metadata);
  await writeFile(join(taskDir, 'README.md'), `# ${task.id} · ${task.title}\n\n${task.user_goal}\n\n\`\`\`bash\npnpm eval -- --task benchmarks/tasks/${task.id}/task.json --model <model> --base-url <url>\n\`\`\`\n`);
  await writeTree(join(taskDir, 'fixture'), fixtureFiles(task, domain.id));
  await mkdir(join(taskDir, 'harness'), { recursive: true });
  await writeFile(join(taskDir, 'harness/expected.json'), JSON.stringify(expected, null, 2) + '\n');
  await writeFile(join(taskDir, 'harness/verify.mjs'), harnessSource(task.id));

  // reference workspace
  const refWs = join(taskDir, 'reference/workspace');
  await rm(refWs, { recursive: true, force: true });
  await cp(join(taskDir, 'fixture'), refWs, { recursive: true });
  const outputs = referenceOutputs(task, expected);
  await writeTree(refWs, outputs);
  if (task.id === 'SD-001') {
    // fix sources for green tests
    await writeFile(join(refWs, 'src/math.js'), 'export function add(a, b) { return a + b; }\nexport function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }\n');
    await writeFile(join(refWs, 'src/format.js'), "export function money(n) { return '$' + Number(n).toFixed(2); }\n");
  }
  await mkdir(join(taskDir, 'reference/output'), { recursive: true });
  for (const [rel, content] of Object.entries(outputs)) {
    if (rel.startsWith('output/')) {
      const path = join(taskDir, 'reference', rel);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  }

  // faults
  for (const faultName of ['fault-a', 'fault-b']) {
    const faultDir = join(taskDir, 'faults', faultName);
    await rm(faultDir, { recursive: true, force: true });
    await cp(refWs, faultDir, { recursive: true });
    if (faultName === 'fault-a') {
      // delete one required file if possible
      const victim = req[0];
      if (victim) await rm(join(faultDir, victim), { force: true });
      else await writeFile(join(faultDir, 'output/report.json'), '{}\n');
    } else {
      // corrupt content
      const victim = req.find((r) => r.endsWith('.json')) || req[0];
      if (victim) await writeFile(join(faultDir, victim), JSON.stringify({ ok: false, broken: true }, null, 2) + '\n');
    }
  }

  // hidden fixture
  const hidden = join(root, 'benchmarks/hidden-fixtures', task.id, 'variant-a');
  await mkdir(join(hidden, 'input'), { recursive: true });
  await writeFile(join(hidden, 'input/sample.txt'), `hidden variant for ${task.id}\n`);

  console.log('created', task.id);
  return 'created';
}

let created = 0;
let skipped = 0;
for (const domain of catalog.domains) {
  for (const task of domain.tasks) {
    const result = await createTask(domain, task);
    if (result === 'created') created += 1;
    else skipped += 1;
  }
}
console.log(JSON.stringify({ created, skipped }, null, 2));
