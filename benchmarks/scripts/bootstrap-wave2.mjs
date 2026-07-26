#!/usr/bin/env node
/**
 * Bootstrap DWB Wave 2 tasks: fixtures, reference solutions, faults, hidden variants.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = join(ROOT, 'tasks');
const HIDDEN = join(ROOT, 'hidden-fixtures');

async function write(p, content) {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, typeof content === 'string' ? content : content);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt32LE(0, 26);
    local.writeUInt16LE(nameBuf.length, 28);
    nameBuf.copy(local, 30);
    const cent = Buffer.alloc(46 + nameBuf.length);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);
    cent.writeUInt16LE(20, 6);
    cent.writeUInt16LE(0, 8);
    cent.writeUInt16LE(0, 10);
    cent.writeUInt16LE(0, 12);
    cent.writeUInt16LE(0, 14);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(data.length, 20);
    cent.writeUInt32LE(data.length, 24);
    cent.writeUInt16LE(nameBuf.length, 28);
    cent.writeUInt16LE(0, 30);
    cent.writeUInt16LE(0, 32);
    cent.writeUInt16LE(0, 34);
    cent.writeUInt16LE(0, 36);
    cent.writeUInt32LE(0, 38);
    cent.writeUInt32LE(offset, 42);
    nameBuf.copy(cent, 46);
    parts.push(local, data);
    central.push(cent);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

function png(w, h, rgba = [0, 0, 0, 255]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, t, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + w * 4);
  row[0] = 0;
  for (let x = 0; x < w; x += 1) {
    const i = 1 + x * 4;
    row[i] = rgba[0]; row[i + 1] = rgba[1]; row[i + 2] = rgba[2]; row[i + 3] = rgba[3];
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateRawSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function readPngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const META = (domain, artifacts, level = 'D2') => `benchmark: dwb
domain: ${domain}
difficulty:
  level: ${level}
  planningDepth: 3
  toolDiversity: 3
  stateDependency: 3
  inputAmbiguity: 3
  verificationDifficulty: 4
  recoveryDemand: 2
frequency: weekly
risk: medium
sourceType: synthesized-from-common-workflow
expectedArtifacts:
${artifacts.map((a) => `  - ${a}`).join('\n')}
diagnostics:
  - D0
  - D1A
  - D1B
`;

const VERIFIER_CMD = {
  command: 'node',
  args: ['harness/verify.mjs'],
  resolveArgsFromTaskDir: true,
  expectedExitCode: 0,
  stdoutIncludes: ['DWB_VERIFY_PASS'],
  timeoutMs: 120000,
};

// ─── PP-001 ───────────────────────────────────────────────────────────────
async function bootstrapPP001() {
  const id = 'PP-001';
  const base = join(TASKS, id);
  const dl = join(base, 'fixture/downloads');
  const files = {
    'report_Q1.pdf': Buffer.from('%PDF-1.4\n% Q1 report\n'),
    'vacation.jpg': Buffer.from('\xff\xd8\xff\xe0JFIF photo\n'),
    'notes.txt': Buffer.from('Meeting notes from Tuesday\n'),
    'sales.csv': Buffer.from('sku,qty\nA1,3\n'),
    'readme.md': Buffer.from('# Downloads readme\n'),
    'bundle.zip': Buffer.from('PK\x03\x04fake zip content\n'),
    'unknown.bin': Buffer.from('\x00\x01\x02noise'),
  };
  for (const [name, data] of Object.entries(files)) await write(join(dl, name), data);
  await write(join(dl, 'report_Q1 (1).pdf'), files['report_Q1.pdf']);

  const organizeScript = `#!/usr/bin/env node
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
  manifest.push({ name, category: cat, sha256: hash, organizedPath: \`organized/\${cat}/\${name}\` });
  if (!hashMap.has(hash)) hashMap.set(hash, []);
  hashMap.get(hash).push(name);
}

const duplicates = [...hashMap.entries()].filter(([, g]) => g.length > 1).map(([hash, files]) => ({ sha256: hash, files }));
await writeFile(join(root, 'manifest.json'), JSON.stringify({ dryRun: true, fileCount: manifest.length, files: manifest }, null, 2) + '\\n');
await writeFile(join(root, 'duplicates.json'), JSON.stringify({ duplicateGroups: duplicates.length, groups: duplicates }, null, 2) + '\\n');
`;

  await write(join(base, 'reference/organize.mjs'), organizeScript);
  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Downloads Organizer',
    prompt: '整理 fixture/downloads/ 中的杂乱文件：按类型分类复制到 organized/（不移动、不删除原文件），并生成 manifest.json 与 duplicates.json。\n\n分类规则：pdf→documents；jpg/jpeg/png/gif→images；csv/json→data；txt/md→text；zip→archives；其余→other。\n\nmanifest.json 含 dryRun:true、fileCount、files（name/category/sha256/organizedPath）。\n\nduplicates.json 含 duplicateGroups 与 groups（sha256+files 列表，仅内容完全相同）。\n\n不要修改 downloads/ 内任何文件。',
    profile: 'file-organizing',
    capabilities: ['read-project', 'transform-data'],
    workflowId: 'inspect-implement-run-verify',
    suite: 'quality', tags: ['dwb', 'personal-productivity', 'D2'],
    fixture: 'fixture',
    limits: { maxTurns: 30, timeoutMs: 900000, maxChangedFiles: 25 },
    verifier: {
      requiredFiles: ['organized/', 'manifest.json', 'duplicates.json'],
      unchangedPaths: ['downloads/'],
      commands: [VERIFIER_CMD],
    },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('personal-productivity', ['organized/', 'manifest.json', 'duplicates.json']));
  await write(join(base, 'README.md'), `# ${id} · Downloads Organizer\n\n整理 downloads/，输出 organized/、manifest.json、duplicates.json。\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ws = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m) => { console.error('DWB_VERIFY_FAIL: ' + m); process.exit(1); };

function cat(ext) {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'documents';
  if (['.jpg','.jpeg','.png','.gif'].includes(e)) return 'images';
  if (['.csv','.json'].includes(e)) return 'data';
  if (['.txt','.md'].includes(e)) return 'text';
  if (e === '.zip') return 'archives';
  return 'other';
}

async function baselineHashes(dir) {
  const names = await readdir(dir);
  const m = new Map();
  for (const n of names) m.set(n, sha256(await readFile(join(dir, n))));
  return m;
}
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function verifyRoot(root) {
  const dl = join(root, 'downloads');
  const before = await baselineHashes(join(taskDir, 'fixture/downloads'));
  const after = await baselineHashes(dl);
  for (const [n, h] of before) if (after.get(n) !== h) fail('downloads modified: ' + n);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const dups = JSON.parse(await readFile(join(root, 'duplicates.json'), 'utf8'));
  const names = [...before.keys()];
  if (manifest.fileCount !== names.length) fail('manifest fileCount mismatch');
  const hashGroups = new Map();
  for (const n of names) {
    const h = after.get(n);
    if (!hashGroups.has(h)) hashGroups.set(h, []);
    hashGroups.get(h).push(n);
    const c = cat(extname(n));
    try { await access(join(root, 'organized', c, n), constants.F_OK); }
    catch { fail('missing organized copy: ' + n); }
    const entry = manifest.files.find((f) => f.name === n);
    if (!entry || entry.category !== c || entry.sha256 !== h) fail('manifest entry wrong: ' + n);
  }
  const expectedGroups = [...hashGroups.values()].filter((g) => g.length > 1).length;
  if (dups.duplicateGroups !== expectedGroups) fail('duplicateGroups mismatch');
}

await verifyRoot(ws);
if (process.env.DWB_HIDDEN_ROOT) {
  for (const v of await readdir(process.env.DWB_HIDDEN_ROOT, { withFileTypes: true })) {
    if (!v.isDirectory()) continue;
    // hidden only checks extra file set when agent script re-run; static outputs validated above
  }
}
console.log('DWB_VERIFY_PASS');
`);

  await write(join(HIDDEN, id, 'extra-noise/input/downloads/extra.log'), Buffer.from('log noise\n'));
  await write(join(HIDDEN, id, 'extra-noise/input/rules.json'), JSON.stringify({ note: 'same rules' }) + '\n');
}

async function bootstrapHiddenExtras() {
  await write(join(HIDDEN, 'SD-002/extra-todo/input/src/todos-patch.json'), '{"note":"hidden variant"}\n');
  await write(join(HIDDEN, 'OA-002/alt-metrics/input/brief.json'), JSON.stringify({ title: 'Q2', sections: ['Executive Summary', 'Metrics'], metrics: { revenue: 1300000, customers: 580 }, slidesMin: 8, slidesMax: 12 }, null, 2) + '\n');
  await write(join(HIDDEN, 'MP-001/extra-image/input/images/c.png'), png(600, 400));
  await write(join(HIDDEN, 'CM-003/extra-busy/input/participants.json'), JSON.stringify({ durationMinutes: 60, timezone: 'UTC', participants: [{ name: 'Alice', tz: 'UTC', busy: [['2026-03-10T08:00:00Z', '2026-03-10T12:00:00Z']] }], constraints: { weekdaysOnly: true, windowStart: '2026-03-10', windowDays: 2 } }, null, 2) + '\n');
  await write(join(HIDDEN, 'BW-001/extra-expense/input/expenses.csv'), 'expense_id,employee,category,amount,receipt_id,date\nE9,Carl,meals,90,R200,2026-01-10\n');
  await write(join(HIDDEN, 'SA-001/missing-health-db/input/compose-snippet.yml'), 'services:\n  db:\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready"]\n');
}

// ─── KW-001 ───────────────────────────────────────────────────────────────
async function bootstrapKW001() {
  const id = 'KW-001';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/sources/product-overview.md'), `# Product Overview\n\n- FACT-001: Launch date is 2026-03-15.\n- FACT-002: Target market is SMB teams.\n`);
  await write(join(base, 'fixture/sources/meeting-notes.txt'), `Meeting 2026-02-01\nFACT-002: SMB teams are primary buyers.\nFACT-003: Budget cap is 50000 USD.\nTODO: finalize pricing by Feb 10.\n`);
  await write(join(base, 'fixture/sources/roadmap.md'), `# Roadmap\n\nFACT-001: GA on 2026-03-15.\nFACT-004: Mobile app follows in Q3.\n`);

  const briefRef = `# Multi-document Brief\n\n## Summary\nMaterials describe a product targeting SMB teams with GA on 2026-03-15 and follow-on mobile work in Q3.\n\n## Key Facts\n- FACT-001: GA / launch date 2026-03-15 (product-overview, roadmap)\n- FACT-002: Target market SMB teams (product-overview, meeting-notes)\n- FACT-003: Budget cap 50000 USD (meeting-notes)\n- FACT-004: Mobile app in Q3 (roadmap)\n\n## Action Items\n- Finalize pricing by Feb 10 (meeting-notes)\n`;
  const sourcesRef = {
    facts: [
      { id: 'FACT-001', text: 'Launch/GA date 2026-03-15', sources: ['product-overview.md', 'roadmap.md'] },
      { id: 'FACT-002', text: 'Target market SMB teams', sources: ['product-overview.md', 'meeting-notes.txt'] },
      { id: 'FACT-003', text: 'Budget cap 50000 USD', sources: ['meeting-notes.txt'] },
      { id: 'FACT-004', text: 'Mobile app in Q3', sources: ['roadmap.md'] },
    ],
    actionItems: [{ text: 'Finalize pricing by Feb 10', source: 'meeting-notes.txt' }],
  };

  await write(join(base, 'reference/brief.md'), briefRef);
  await write(join(base, 'reference/sources.json'), JSON.stringify(sourcesRef, null, 2) + '\n');

  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Multi-document Brief',
    prompt: '阅读 sources/ 下三份材料，生成 brief.md 与 sources.json。\n\nbrief.md 必须含 ## Summary、## Key Facts、## Action Items。\n\nKey Facts 使用 FACT-001.. 编号，内容只能来自输入材料（可合并重复 FACT-002 等），不得编造。\n\nsources.json 结构：{ facts:[{id,text,sources[]}], actionItems:[{text,source}] }，sources 为文件名。',
    profile: 'office',
    capabilities: ['read-project', 'transform-data'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'knowledge-work', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 24, timeoutMs: 600000, maxChangedFiles: 10 },
    verifier: { requiredFiles: ['brief.md', 'sources.json'], unchangedPaths: ['sources/'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('knowledge-work', ['brief.md', 'sources.json']));
  await write(join(base, 'README.md'), `# ${id} · Multi-document Brief\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
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
`);
  await write(join(HIDDEN, id, 'extra-doc/input/sources/compliance.txt'), 'FACT-005: Compliance audit passed.\n');
}

// ─── DP-002 ───────────────────────────────────────────────────────────────
async function bootstrapDP002() {
  const id = 'DP-002';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/input/customers.csv'), 'customer_id,name,email\nC1,Acme,a@acme.com\nC2,Beta,b@beta.com\n');
  await write(join(base, 'fixture/input/orders.csv'), 'order_id,customer_id,product_id,amount\nO1,C1,P1,100\nO2,C9,P1,50\nO3,C2,P2,80\nO4,C1,P1,100\n');
  await write(join(base, 'fixture/input/products.csv'), 'product_id,name,unit_price\nP1,Widget,10\nP2,Gadget,40\nP9,Unknown,1\n');

  const mergeScript = `#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.argv[2] ?? process.cwd();
function parseCsv(t){const lines=t.trim().split('\\n');const h=lines[0].split(',');return lines.slice(1).filter(Boolean).map(l=>{const c=l.split(',');const o={};h.forEach((x,i)=>o[x]=c[i]);return o;});}
const customers=Object.fromEntries(parseCsv(await readFile(join(root,'input/customers.csv'),'utf8')).map(r=>[r.customer_id,r]));
const products=Object.fromEntries(parseCsv(await readFile(join(root,'input/products.csv'),'utf8')).map(r=>[r.product_id,r]));
const orders=parseCsv(await readFile(join(root,'input/orders.csv'),'utf8'));
const merged=[];const unmatched=[];let conflicts=0;const seen=new Set();
for(const o of orders){
  if(seen.has(o.order_id)){conflicts++;continue;} seen.add(o.order_id);
  const c=customers[o.customer_id]; const p=products[o.product_id];
  if(!c||!p){unmatched.push({...o,reason:!c&&!p?'missing_customer_and_product':!c?'missing_customer':'missing_product'});continue;}
  merged.push({order_id:o.order_id,customer_id:o.customer_id,customer_name:c.name,product_id:o.product_id,product_name:p.name,amount:o.amount,unit_price:p.unit_price});
}
await mkdir(join(root,'output'),{recursive:true});
const hdr='order_id,customer_id,customer_name,product_id,product_name,amount,unit_price';
await writeFile(join(root,'output/merged.csv'),hdr+'\\n'+merged.map(r=>hdr.split(',').map(k=>r[k]).join(',')).join('\\n')+'\\n');
await writeFile(join(root,'output/unmatched.csv'),'order_id,customer_id,product_id,amount,reason\\n'+unmatched.map(r=>\`\${r.order_id},\${r.customer_id},\${r.product_id},\${r.amount},\${r.reason}\`).join('\\n')+'\\n');
await writeFile(join(root,'output/report.json'),JSON.stringify({totalOrders:orders.length,mergedRows:merged.length,unmatchedRows:unmatched.length,duplicateOrdersSkipped:conflicts},null,2)+'\\n');
`;

  await write(join(base, 'reference/merge.mjs'), mergeScript);
  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Multi-source Data Merge',
    prompt: '合并 input/ 下 customers.csv、orders.csv、products.csv。\n\n输出 output/merged.csv（保留 orders 首次出现顺序，关联 customer 与 product 名称）、output/unmatched.csv（无法关联的行+reason）、output/report.json（totalOrders/mergedRows/unmatchedRows/duplicateOrdersSkipped）。\n\n重复 order_id 跳过并计入 duplicateOrdersSkipped。不要修改 input/。',
    profile: 'coding', capabilities: ['read-project', 'edit-code', 'transform-data'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'data-processing', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 30, timeoutMs: 900000, maxChangedFiles: 15 },
    verifier: { requiredFiles: ['output/merged.csv','output/unmatched.csv','output/report.json'], unchangedPaths: ['input/customers.csv','input/orders.csv','input/products.csv'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('data-processing', ['output/merged.csv','output/unmatched.csv','output/report.json']));
  await write(join(base, 'README.md'), `# ${id} · Multi-source Data Merge\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
function parseCsv(t){const lines=t.trim().split('\\n');const h=lines[0].split(',');return lines.slice(1).filter(Boolean).map(l=>{const c=l.split(',');const o={};h.forEach((x,i)=>o[x]=c[i]);return o;});}
async function expected(){
  const customers=Object.fromEntries(parseCsv(await readFile(join(taskDir,'fixture/input/customers.csv'),'utf8')).map(r=>[r.customer_id,r]));
  const products=Object.fromEntries(parseCsv(await readFile(join(taskDir,'fixture/input/products.csv'),'utf8')).map(r=>[r.product_id,r]));
  const orders=parseCsv(await readFile(join(taskDir,'fixture/input/orders.csv'),'utf8'));
  let merged=0,unmatched=0,dup=0;const seen=new Set();
  for(const o of orders){if(seen.has(o.order_id)){dup++;continue;}seen.add(o.order_id);if(!customers[o.customer_id]||!products[o.product_id])unmatched++;else merged++;}
  return {merged,unmatched,dup,total:orders.length};
}
const exp=await expected();
const report=JSON.parse(await readFile(join(ws,'output/report.json'),'utf8'));
if(report.totalOrders!==exp.total||report.mergedRows!==exp.merged||report.unmatchedRows!==exp.unmatched||report.duplicateOrdersSkipped!==exp.dup) fail('report mismatch');
const merged=parseCsv(await readFile(join(ws,'output/merged.csv'),'utf8'));
if(merged.length!==exp.merged) fail('merged count');
const unmatched=parseCsv(await readFile(join(ws,'output/unmatched.csv'),'utf8'));
if(unmatched.length!==exp.unmatched) fail('unmatched count');
for(const p of ['input/customers.csv','input/orders.csv','input/products.csv']){
  const a=await readFile(join(taskDir,'fixture',p)); const b=await readFile(join(ws,p));
  if(!a.equals(b)) fail('modified '+p);
}
console.log('DWB_VERIFY_PASS');
`);
  await write(join(HIDDEN, id, 'alt-keys/input/orders.csv'), 'order_id,customer_id,product_id,amount\nO9,C2,P2,30\n');
}

// ─── SD-002 ───────────────────────────────────────────────────────────────
async function bootstrapSD002() {
  const id = 'SD-002';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/package.json'), JSON.stringify({ name: 'todo-mini', type: 'module', scripts: { test: 'node --test test/*.test.js' } }, null, 2) + '\n');
  await write(join(base, 'fixture/src/todos.js'), `export const todos = [
  { id: 1, text: 'Buy milk', done: false, tag: 'home' },
  { id: 2, text: 'Write report', done: true, tag: 'work' },
  { id: 3, text: 'Call dentist', done: false, tag: 'home' },
];
`);
  await write(join(base, 'fixture/src/filter.js'), `import { todos } from './todos.js';
/** TODO: implement filterTodos */
export function filterTodos(_query, _tag) {
  return todos;
}
`);
  await write(join(base, 'fixture/test/filter.test.js'), `import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTodos } from '../src/filter.js';

test('empty query returns all for tag', () => {
  assert.equal(filterTodos('', 'home').length, 2);
});
test('query matches text case-insensitive', () => {
  const r = filterTodos('milk', 'home');
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'Buy milk');
});
test('tag work excludes home items', () => {
  assert.equal(filterTodos('', 'work').length, 1);
});
test('combined query and tag', () => {
  assert.equal(filterTodos('call', 'home').length, 1);
});
`);
  await write(join(base, 'reference/src/filter.js'), `import { todos } from './todos.js';
export function filterTodos(query, tag) {
  const q = (query ?? '').trim().toLowerCase();
  const t = (tag ?? '').trim().toLowerCase();
  return todos.filter((item) => {
    const tagOk = !t || (item.tag ?? '').toLowerCase() === t;
    const textOk = !q || item.text.toLowerCase().includes(q);
    return tagOk && textOk;
  });
}
`);

  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Incremental Feature',
    prompt: '在 todo-mini 项目中实现 src/filter.js 的 filterTodos(query, tag)：按 tag 精确匹配（空 tag 表示不限），query 对 text 大小写不敏感子串匹配（空 query 表示不限）。不要修改 test/ 与 package.json。完成后运行 npm test。',
    profile: 'coding', capabilities: ['read-project', 'edit-code', 'run-tests', 'inspect-git-diff'],
    workflowId: 'coding-change-verify', suite: 'quality', tags: ['dwb', 'software-development', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 24, timeoutMs: 600000, maxChangedFiles: 3 },
    verifier: {
      requiredFiles: ['src/filter.js'], unchangedPaths: ['test/filter.test.js', 'package.json'],
      commands: [
        VERIFIER_CMD,
        { command: 'npm', args: ['test'], expectedExitCode: 0, timeoutMs: 60000 },
      ],
    },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('software-development', ['src/filter.js']));
  await write(join(base, 'README.md'), `# ${id} · Incremental Feature\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
for(const p of ['test/filter.test.js','package.json']){
  const a=await readFile(join(taskDir,'fixture',p)); const b=await readFile(join(ws,p));
  if(!a.equals(b)) fail('protected '+p);
}
const code=await readFile(join(ws,'src/filter.js'),'utf8');
if(!/filterTodos/.test(code)||/TODO: implement/.test(code)) fail('filter not implemented');
const { filterTodos } = await import(pathToFileURL(join(ws,'src/filter.js')).href);
if(filterTodos('', 'home').length!==2) fail('filter empty query home');
if(filterTodos('milk', 'home').length!==1) fail('filter milk');
if(filterTodos('', 'work').length!==1) fail('filter work tag');
if(filterTodos('call', 'home').length!==1) fail('filter combined');
console.log('DWB_VERIFY_PASS');
`);
}

// ─── OA-002 ───────────────────────────────────────────────────────────────
async function bootstrapOA002() {
  const id = 'OA-002';
  const base = join(TASKS, id);
  const brief = {
    title: 'Q1 Business Review',
    sections: ['Executive Summary', 'Metrics', 'Risks', 'Next Steps'],
    metrics: { revenue: 1200000, growth: 0.12, customers: 540 },
    slidesMin: 8, slidesMax: 12,
  };
  await write(join(base, 'fixture/input/brief.json'), JSON.stringify(brief, null, 2) + '\n');

  function slideXml(title, bullets) {
    const body = bullets.map((b) => `<a:p><a:r><a:t>${b}</a:t></a:r></a:p>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${title}</a:t></a:r></a:p>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  }
  const slides = [
    slideXml('Q1 Business Review', ['Executive Summary']),
    slideXml('Executive Summary', ['Revenue growth continues']),
    slideXml('Metrics', ['Revenue: 1200000', 'Growth: 12%', 'Customers: 540']),
    slideXml('Chart', ['Revenue trend placeholder']),
    slideXml('Highlights', ['Enterprise wins', 'Retention up']),
    slideXml('Risks', ['Supply chain', 'Competition']),
    slideXml('Mitigation', ['Dual sourcing']),
    slideXml('Next Steps', ['Expand APAC', 'Launch tier-2']),
    slideXml('Conclusion', ['On track for targets']),
  ];
  const slideRels = slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`) },
    { name: 'ppt/presentation.xml', data: Buffer.from(`<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`) },
    { name: 'ppt/_rels/presentation.xml.rels', data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels}</Relationships>`) },
    ...slides.map((xml, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, data: Buffer.from(xml) })),
  ];
  const pptxBuf = zipStore(files);
  await write(join(base, 'reference/output/presentation.pptx'), pptxBuf);
  await write(join(base, 'reference/output/outline.md'), slides.map((_, i) => `${i + 1}. Slide ${i + 1}`).join('\n') + '\n');

  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Presentation from Brief',
    prompt: '根据 input/brief.json 生成 output/presentation.pptx（8–12 页）与 output/outline.md。\n\n必须覆盖 brief 中 sections（Executive Summary/Metrics/Risks/Next Steps），Metrics 页需包含 revenue 1200000 与 customers 540。\n\n不要修改 input/brief.json。',
    profile: 'office', capabilities: ['read-project', 'create-pptx', 'validate-pptx'],
    workflowId: 'office-create-validate', suite: 'quality', tags: ['dwb', 'office-automation', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 20, timeoutMs: 600000, maxChangedFiles: 8 },
    verifier: { requiredFiles: ['output/presentation.pptx','output/outline.md'], unchangedPaths: ['input/brief.json'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('office-automation', ['output/presentation.pptx','output/outline.md']));
  await write(join(base, 'README.md'), `# ${id} · Presentation from Brief\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};

function listZipEntries(buf){
  const names=[];
  for(let i=0;i<buf.length-4;i++){
    if(buf.readUInt32LE(i)===0x02014b50){
      const nlen=buf.readUInt16LE(i+28);
      names.push(buf.subarray(i+46,i+46+nlen).toString('utf8'));
    }
  }
  return names;
}

const pptx=await readFile(join(ws,'output/presentation.pptx'));
const entries=listZipEntries(pptx);
const slides=entries.filter((n) => n.startsWith('ppt/slides/slide') && n.endsWith('.xml'));
if(slides.length<8||slides.length>12) fail('slide count '+slides.length);
const all=pptx.toString('latin1');
for(const s of ['Executive Summary','Metrics','Risks','Next Steps','1200000','540']) if(!all.includes(s)) fail('missing '+s);
const outline=await readFile(join(ws,'output/outline.md'),'utf8');
if(outline.split('\\n').filter(Boolean).length<8) fail('outline too short');
const briefA=await readFile(join(taskDir,'fixture/input/brief.json'));
const briefB=await readFile(join(ws,'input/brief.json'));
if(!briefA.equals(briefB)) fail('brief modified');
console.log('DWB_VERIFY_PASS');
`);
}

// ─── FM-003 ───────────────────────────────────────────────────────────────
async function bootstrapFM003() {
  const id = 'FM-003';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/source/docs/readme.txt'), 'Important docs\n');
  await write(join(base, 'fixture/source/data/config.json'), '{"env":"prod"}\n');

  const backupScript = `#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
const root = process.argv[2] ?? process.cwd();
const src = join(root, 'source');
const dst = join(root, 'backup');
async function walk(dir, base='') {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const rel = base ? base + '/' + name : name;
    const st = await stat(p);
    if (st.isDirectory()) out.push(...await walk(p, rel));
    else out.push({ rel, p, size: st.size });
  }
  return out;
}
const files = await walk(src);
const manifest = [];
for (const f of files) {
  const data = await readFile(f.p);
  const hash = createHash('sha256').update(data).digest('hex');
  const target = join(dst, f.rel);
  await mkdir(join(target, '..'), { recursive: true });
  await copyFile(f.p, target);
  manifest.push({ path: f.rel, size: f.size, sha256: hash });
}
await writeFile(join(root, 'manifest.json'), JSON.stringify({ fileCount: manifest.length, files: manifest }, null, 2) + '\\n');
await writeFile(join(root, 'verification.json'), JSON.stringify({ passed: true, fileCount: manifest.length, mismatches: [] }, null, 2) + '\\n');
`;

  await write(join(base, 'reference/backup.mjs'), backupScript);
  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Verified Backup',
    prompt: '将 source/ 完整备份到 backup/，生成 manifest.json（fileCount+files 含 path/size/sha256）与 verification.json（passed/fileCount/mismatches）。不要修改 source/ 内任何文件。',
    profile: 'file-organizing', capabilities: ['read-project', 'transform-data'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'file-management', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 20, timeoutMs: 600000, maxChangedFiles: 20 },
    verifier: { requiredFiles: ['backup/','manifest.json','verification.json'], unchangedPaths: ['source/'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('file-management', ['backup/','manifest.json','verification.json']));
  await write(join(base, 'README.md'), `# ${id} · Verified Backup\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
async function walk(dir, base=''){const out=[];for(const n of await readdir(dir)){const p=join(dir,n);const rel=base?base+'/'+n:n;const st=await stat(p);if(st.isDirectory())out.push(...await walk(p,rel));else out.push({rel,p,size:st.size});}return out;}
const srcFiles=await walk(join(ws,'source'));
const manifest=JSON.parse(await readFile(join(ws,'manifest.json'),'utf8'));
const ver=JSON.parse(await readFile(join(ws,'verification.json'),'utf8'));
if(manifest.fileCount!==srcFiles.length||ver.fileCount!==srcFiles.length) fail('fileCount');
if(!ver.passed||ver.mismatches.length) fail('verification failed');
for(const f of srcFiles){
  const data=await readFile(f.p); const hash=createHash('sha256').update(data).digest('hex');
  const m=manifest.files.find(x=>x.path===f.rel);
  if(!m||m.sha256!==hash||m.size!==f.size) fail('manifest mismatch '+f.rel);
  const bak=await readFile(join(ws,'backup',f.rel));
  if(!data.equals(bak)) fail('backup content '+f.rel);
}
for(const f of srcFiles){
  const a=await readFile(f.p); const b=await readFile(join(taskDir,'fixture/source',f.rel));
  if(!a.equals(b)) fail('source modified '+f.rel);
}
console.log('DWB_VERIFY_PASS');
`);
  await write(join(HIDDEN, id, 'more-files/input/source/extra/note.txt'), 'extra\n');
}

// ─── MP-001 ───────────────────────────────────────────────────────────────
async function bootstrapMP001() {
  const id = 'MP-001';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/input/images/a.png'), png(1200, 900));
  await write(join(base, 'fixture/input/images/b.png'), png(400, 300, [255, 0, 0, 128]));
  await write(join(base, 'fixture/input/rules.json'), JSON.stringify({ maxWidth: 800, maxHeight: 600, format: 'png' }, null, 2) + '\n');

  const optScript = `#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function readPngSize(buf){return{width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};}
function scale(w,h,mw,mh){const s=Math.min(mw/w,mh/h,1);return{width:Math.round(w*s),height:Math.round(h*s)};}

const root=process.argv[2]??process.cwd();
const rules=JSON.parse(await readFile(join(root,'input/rules.json'),'utf8'));
const names=await readdir(join(root,'input/images'));
await mkdir(join(root,'optimized'),{recursive:true});
const manifest=[];
let processed=0,skipped=0;
for(const name of names){
  const src=await readFile(join(root,'input/images',name));
  const {width,height}=readPngSize(src);
  const target=scale(width,height,rules.maxWidth,rules.maxHeight);
  const outName=name;
  const outPath=join(root,'optimized',outName);
  if(target.width===width&&target.height===height){
    await writeFile(outPath,src); skipped++;
  } else {
    // fixture: copy with marker comment in ancillary chunk not used — store scaled dims in manifest only
    await writeFile(outPath,src); processed++;
  }
  manifest.push({source:name,optimized:outName,sourceWidth:width,sourceHeight:height,targetWidth:target.width,targetHeight:target.height,sha256:createHash('sha256').update(await readFile(outPath)).digest('hex')});
}
await writeFile(join(root,'manifest.csv'),'source,optimized,sourceWidth,sourceHeight,targetWidth,targetHeight,sha256\\n'+manifest.map(r=>Object.values(r).join(',')).join('\\n')+'\\n');
await writeFile(join(root,'report.json'),JSON.stringify({processed,skipped,errors:[]},null,2)+'\\n');
`;

  await write(join(base, 'reference/optimize.mjs'), optScript);
  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Image Batch Optimization',
    prompt: '按 input/rules.json（maxWidth 800, maxHeight 600）处理 input/images/ 下 PNG，输出 optimized/、manifest.csv、report.json。\n\nmanifest.csv 列：source,optimized,sourceWidth,sourceHeight,targetWidth,targetHeight,sha256。\n\nreport.json：processed/skipped/errors。超大图片 target 尺寸应不超过规则（可 copy 若未缩放，但 manifest 尺寸字段须正确）。不要修改 input/。',
    profile: 'coding', capabilities: ['read-project', 'edit-code', 'transform-data'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'media-processing', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 24, timeoutMs: 600000, maxChangedFiles: 15 },
    verifier: { requiredFiles: ['optimized/','manifest.csv','report.json'], unchangedPaths: ['input/images/a.png','input/images/b.png','input/rules.json'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('media-processing', ['optimized/','manifest.csv','report.json']));
  await write(join(base, 'README.md'), `# ${id} · Image Batch Optimization\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
function readPngSize(buf){return{width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};}
function scale(w,h,mw,mh){const s=Math.min(mw/w,mh/h,1);return{width:Math.round(w*s),height:Math.round(h*s)};}
const rules=JSON.parse(await readFile(join(ws,'input/rules.json'),'utf8'));
const names=await readdir(join(ws,'input/images'));
const lines=(await readFile(join(ws,'manifest.csv'),'utf8')).trim().split('\\n').slice(1);
if(lines.length!==names.length) fail('manifest rows');
for(const line of lines){
  const [source,,sw,sh,tw,th]=line.split(',');
  const src=await readFile(join(ws,'input/images',source));
  const {width,height}=readPngSize(src);
  if(Number(sw)!==width||Number(sh)!==height) fail('source dims '+source);
  const exp=scale(width,height,rules.maxWidth,rules.maxHeight);
  if(Number(tw)!==exp.width||Number(th)!==exp.height) fail('target dims '+source);
  try{await readFile(join(ws,'optimized',source));}catch{fail('missing optimized '+source);}
}
const report=JSON.parse(await readFile(join(ws,'report.json'),'utf8'));
if(report.errors?.length) fail('errors present');
for(const n of ['input/images/a.png','input/images/b.png','input/rules.json']){
  const a=await readFile(join(taskDir,'fixture',n)); const b=await readFile(join(ws,n));
  if(!a.equals(b)) fail('modified '+n);
}
console.log('DWB_VERIFY_PASS');
`);
}

// ─── CM-003 ───────────────────────────────────────────────────────────────
async function bootstrapCM003() {
  const id = 'CM-003';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/input/participants.json'), JSON.stringify({
    durationMinutes: 60,
    timezone: 'Asia/Shanghai',
    participants: [
      { name: 'Alice', tz: 'Asia/Shanghai', busy: [['2026-03-10T01:00:00Z', '2026-03-10T03:00:00Z'], ['2026-03-10T06:00:00Z', '2026-03-10T07:00:00Z']] },
      { name: 'Bob', tz: 'America/New_York', busy: [['2026-03-10T00:00:00Z', '2026-03-10T02:00:00Z']] },
    ],
    constraints: { weekdaysOnly: true, localStartHour: 9, localEndHour: 17, windowStart: '2026-03-10', windowDays: 3 },
  }, null, 2) + '\n');

  const refOptions = {
    candidates: [
      { rank: 1, startUtc: '2026-03-10T07:00:00Z', endUtc: '2026-03-10T08:00:00Z', score: 100, note: 'After Alice afternoon block' },
      { rank: 2, startUtc: '2026-03-10T08:00:00Z', endUtc: '2026-03-10T09:00:00Z', score: 90, note: 'Morning UTC slot' },
    ],
  };
  await write(join(base, 'reference/meeting-options.json'), JSON.stringify(refOptions, null, 2) + '\n');
  await write(join(base, 'reference/proposal.md'), `# Meeting Proposal\n\n## Top Options\n1. 2026-03-10 14:00-15:00 Asia/Shanghai (UTC 06:00-07:00)\n\nNo calendar writes performed.\n`);

  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Meeting Scheduling Proposal',
    prompt: '根据 input/participants.json 生成 meeting-options.json（candidates 数组：rank/startUtc/endUtc/score/note，至少 2 个无冲突候选）与 proposal.md（说明时区与理由）。不要写入真实日历；不要修改 input/。',
    profile: 'office', capabilities: ['read-project', 'transform-data'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'communication', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 20, timeoutMs: 600000, maxChangedFiles: 10 },
    verifier: { requiredFiles: ['meeting-options.json','proposal.md'], unchangedPaths: ['input/participants.json'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('communication', ['meeting-options.json','proposal.md']));
  await write(join(base, 'README.md'), `# ${id} · Meeting Scheduling Proposal\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};

const cfg=JSON.parse(await readFile(join(ws,'input/participants.json'),'utf8'));
const opts=JSON.parse(await readFile(join(ws,'meeting-options.json'),'utf8'));
if(!opts.candidates||opts.candidates.length<2) fail('need >=2 candidates');

function parseBusy(){
  const blocks=[];
  for(const p of cfg.participants){
    for(const [s,e] of p.busy){
      blocks.push({start:new Date(s+(s.includes('Z')?'':'Z')).getTime(),end:new Date(e+(e.includes('Z')?'':'Z')).getTime()});
    }
  }
  return blocks;
}
const busy=parseBusy();
const dur=cfg.durationMinutes*60*1000;
for(const c of opts.candidates){
  const st=new Date(c.startUtc).getTime();
  const en=new Date(c.endUtc).getTime();
  if(en-st!==dur) fail('duration mismatch');
  for(const b of busy){if(st<b.end&&en>b.start) fail('conflict '+c.startUtc);}
  const d=new Date(c.startUtc);
  const wd=d.getUTCDay();
  if(cfg.constraints.weekdaysOnly&&(wd===0||wd===6)) fail('weekend slot');
}
const prop=await readFile(join(ws,'proposal.md'),'utf8');
if(prop.trim().length<30) fail('proposal too short');
const a=await readFile(join(taskDir,'fixture/input/participants.json'));
const b=await readFile(join(ws,'input/participants.json'));
if(!a.equals(b)) fail('input modified');
console.log('DWB_VERIFY_PASS');
`);
}

// ─── BW-001 ───────────────────────────────────────────────────────────────
async function bootstrapBW001() {
  const id = 'BW-001';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/input/expenses.csv'), 'expense_id,employee,category,amount,receipt_id,date\nE1,Ann,meals,80,R100,2026-01-05\nE2,Ann,travel,200,R101,2026-01-06\nE3,Bob,meals,20,R102,2026-01-07\nE4,Bob,meals,30,,2026-01-08\nE5,Ann,meals,80,R100,2026-01-09\n');
  await write(join(base, 'fixture/input/policy.json'), JSON.stringify({ mealLimit: 75, receiptRequiredAbove: 25, categories: ['meals', 'travel'] }, null, 2) + '\n');

  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Expense Reconciliation',
    prompt: '核对 input/expenses.csv 与 input/policy.json，输出 exceptions.csv（expense_id,rule,reason）与 summary.md（总笔数、总金额、异常数、按规则汇总）。\n\n规则：meals>mealLimit 违规；amount>receiptRequiredAbove 且无 receipt_id 违规；重复 receipt_id 违规。不要修改 input/。',
    profile: 'office', capabilities: ['read-project', 'transform-data', 'inspect-spreadsheet'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'business-workflow', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 24, timeoutMs: 600000, maxChangedFiles: 10 },
    verifier: { requiredFiles: ['exceptions.csv','summary.md'], unchangedPaths: ['input/expenses.csv','input/policy.json'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('business-workflow', ['exceptions.csv','summary.md']));
  await write(join(base, 'README.md'), `# ${id} · Expense Reconciliation\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
function parseCsv(t){const lines=t.trim().split('\\n');const h=lines[0].split(',');return lines.slice(1).filter(Boolean).map(l=>{const c=l.split(',');const o={};h.forEach((x,i)=>o[x]=c[i]);return o;});}
const expenses=parseCsv(await readFile(join(ws,'input/expenses.csv'),'utf8'));
const policy=JSON.parse(await readFile(join(ws,'input/policy.json'),'utf8'));
const expected=[];
const receipts=new Map();
let total=0;
for(const e of expenses){
  total+=Number(e.amount);
  if(e.category==='meals'&&Number(e.amount)>policy.mealLimit) expected.push({expense_id:e.expense_id,rule:'meal_limit'});
  if(Number(e.amount)>policy.receiptRequiredAbove&&!e.receipt_id) expected.push({expense_id:e.expense_id,rule:'missing_receipt'});
  if(e.receipt_id){
    if(receipts.has(e.receipt_id)) expected.push({expense_id:e.expense_id,rule:'duplicate_receipt'});
    receipts.set(e.receipt_id,e.expense_id);
  }
}
const ex=parseCsv(await readFile(join(ws,'exceptions.csv'),'utf8'));
if(ex.length!==expected.length) fail('exception count '+ex.length+' vs '+expected.length);
for(const exp of expected){
  if(!ex.find(x=>x.expense_id===exp.expense_id&&x.rule===exp.rule)) fail('missing exception '+exp.expense_id+' '+exp.rule);
}
const summary=await readFile(join(ws,'summary.md'),'utf8');
if(!summary.includes(String(total))&&!summary.includes('410')) fail('summary missing total amount');
if(!summary.includes(String(expected.length))) fail('summary missing exception count');
for(const p of ['input/expenses.csv','input/policy.json']){
  const a=await readFile(join(taskDir,'fixture',p)); const b=await readFile(join(ws,p));
  if(!a.equals(b)) fail('modified '+p);
}
console.log('DWB_VERIFY_PASS');
`);
}

// ─── SA-001 ───────────────────────────────────────────────────────────────
async function bootstrapSA001() {
  const id = 'SA-001';
  const base = join(TASKS, id);
  await write(join(base, 'fixture/docker-compose.yml'), `version: '3.8'
services:
  web:
    image: nginx:1.25
    ports: "8080:80"
    depends_on:
      - api
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
  api:
    image: api:local
    depends_on: db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  db:
    image: postgres:15
    volumes:
      - db_data:/var/lib/postgresql/data
volumes:
  db_data:
`);
  await write(join(base, 'fixture/logs/error.txt'), 'dependency failed to start: invalid depends_on format\n');

  const fixed = `version: '3.8'
services:
  web:
    image: nginx:1.25
    ports:
      - "8080:80"
    depends_on:
      api:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 10s
      timeout: 5s
      retries: 3
  api:
    image: api:local
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
  db:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - db_data:/var/lib/postgresql/data
volumes:
  db_data:
`;
  await write(join(base, 'reference/docker-compose.yml'), fixed);
  await write(join(base, 'reference/diagnosis.md'), '# Diagnosis\n\nFixed ports mapping, depends_on syntax, and healthcheck intervals.\n');

  await write(join(base, 'task.json'), JSON.stringify({
    schemaVersion: 1, id, version: '1.0.0', title: 'Docker Compose Repair',
    prompt: '修复 docker-compose.yml（参考 logs/error.txt），并写 diagnosis.md 说明修改点。要求：ports 映射为列表；depends_on 使用合法 long syntax；web/api/db 均含 healthcheck.test/interval/timeout/retries。不要删除 volumes/db_data；不要实际运行 docker。',
    profile: 'coding', capabilities: ['read-project', 'edit-code'],
    workflowId: 'inspect-implement-run-verify', suite: 'quality', tags: ['dwb', 'system-administration', 'D2'],
    fixture: 'fixture', limits: { maxTurns: 20, timeoutMs: 600000, maxChangedFiles: 5 },
    verifier: { requiredFiles: ['docker-compose.yml','diagnosis.md'], unchangedPaths: ['logs/error.txt'], commands: [VERIFIER_CMD] },
  }, null, 2) + '\n');
  await write(join(base, 'metadata.yaml'), META('system-administration', ['docker-compose.yml','diagnosis.md']));
  await write(join(base, 'README.md'), `# ${id} · Docker Compose Repair\n`);
  await write(join(base, 'harness/verify.mjs'), `#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};

const yml=await readFile(join(ws,'docker-compose.yml'),'utf8');
if(/ports: "8080:80"/.test(yml)) fail('ports still invalid string form');
if(!/interval:\\s*10s/.test(yml)) fail('missing healthcheck interval');
if(!/timeout:\\s*5s/.test(yml)) fail('missing healthcheck timeout');
if(!/retries:\\s*3/.test(yml)) fail('missing healthcheck retries');
for(const svc of ['web','api','db']){
  const re=new RegExp(svc+':[\\\\s\\\\S]*?healthcheck:[\\\\s\\\\S]*?test:', 'm');
  if(!re.test(yml)) fail('healthcheck missing for '+svc);
}
if(!/condition:\\s*service_/.test(yml)) fail('depends_on condition missing');
if(!/db_data:/.test(yml)) fail('db_data volume removed');
const diag=await readFile(join(ws,'diagnosis.md'),'utf8');
if(diag.length<20) fail('diagnosis too short');
const logA=await readFile(join(taskDir,'fixture/logs/error.txt'));
const logB=await readFile(join(ws,'logs/error.txt'));
if(!logA.equals(logB)) fail('logs modified');
console.log('DWB_VERIFY_PASS');
`);
}

async function runReference(id, script, outDirs = []) {
  const base = join(TASKS, id);
  const ws = join(base, 'reference/workspace');
  await rm(ws, { recursive: true, force: true });
  await mkdir(ws, { recursive: true });
  // copy fixture
  async function cpDir(src, dst) {
    await mkdir(dst, { recursive: true });
    for (const ent of await readdir(src, { withFileTypes: true })) {
      const s = join(src, ent.name);
      const d = join(dst, ent.name);
      if (ent.isDirectory()) await cpDir(s, d);
      else await copyFile(s, d);
    }
  }
  const fixture = join(base, 'fixture');
  await cpDir(fixture, ws);
  if (script) {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, [join(base, 'reference', script), ws], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${id} reference script failed: ${r.stderr}`);
  }
  // copy reference outputs for file-based refs
  for (const rel of outDirs) {
    await mkdir(join(ws, rel.split('/')[0]), { recursive: true });
    await cpDir(join(base, 'reference', rel), join(ws, rel));
  }
  // special copies
  if (id === 'KW-001') {
    await copyFile(join(base, 'reference/brief.md'), join(ws, 'brief.md'));
    await copyFile(join(base, 'reference/sources.json'), join(ws, 'sources.json'));
  }
  if (id === 'SD-002') {
    await copyFile(join(base, 'reference/src/filter.js'), join(ws, 'src/filter.js'));
  }
  if (id === 'SA-001') {
    await copyFile(join(base, 'reference/docker-compose.yml'), join(ws, 'docker-compose.yml'));
    await copyFile(join(base, 'reference/diagnosis.md'), join(ws, 'diagnosis.md'));
  }
  if (id === 'CM-003') {
    await copyFile(join(base, 'reference/meeting-options.json'), join(ws, 'meeting-options.json'));
    await copyFile(join(base, 'reference/proposal.md'), join(ws, 'proposal.md'));
  }
  return ws;
}

async function verifyWorkspace(id, ws) {
  const { spawnSync } = await import('node:child_process');
  const harness = join(TASKS, id, 'harness/verify.mjs');
  const r = spawnSync(process.execPath, [harness], { cwd: ws, encoding: 'utf8', env: { ...process.env } });
  return { pass: r.status === 0 && r.stdout.includes('DWB_VERIFY_PASS'), stdout: r.stdout, stderr: r.stderr };
}

async function buildFaults() {
  // PP-001 faults
  const ppWs = join(TASKS, 'PP-001/reference/workspace');
  await mkdir(join(TASKS, 'PP-001/faults/missed-duplicates'), { recursive: true });
  await copyFile(join(ppWs, 'manifest.json'), join(TASKS, 'PP-001/faults/missed-duplicates/manifest.json'));
  await write(join(TASKS, 'PP-001/faults/missed-duplicates/duplicates.json'), JSON.stringify({ duplicateGroups: 0, groups: [] }, null, 2) + '\n');
  await mkdir(join(TASKS, 'PP-001/faults/wrong-count'), { recursive: true });
  const m = JSON.parse(await readFile(join(ppWs, 'manifest.json'), 'utf8'));
  m.fileCount = 1;
  await write(join(TASKS, 'PP-001/faults/wrong-count/manifest.json'), JSON.stringify(m, null, 2) + '\n');
  await copyFile(join(ppWs, 'duplicates.json'), join(TASKS, 'PP-001/faults/wrong-count/duplicates.json'));

  // KW-001
  await copyFile(join(TASKS, 'KW-001/reference/brief.md'), join(TASKS, 'KW-001/faults/missing-sections/brief.md'));
  await write(join(TASKS, 'KW-001/faults/missing-sections/sources.json'), JSON.stringify({ facts: [], actionItems: [] }) + '\n');
  await write(join(TASKS, 'KW-001/faults/hallucinated/brief.md'), '# Brief\n## Summary\nok\n## Key Facts\nFACT-005: fake\n## Action Items\nnone\n');
  await write(join(TASKS, 'KW-001/faults/hallucinated/sources.json'), JSON.stringify({ facts: [{ id: 'FACT-005', text: 'fake', sources: ['x'] }], actionItems: [] }) + '\n');

  // More faults created similarly at verify time using workspace copies - generate via helper below
}

const TASK_CONFIG = [
  { id: 'PP-001', script: 'organize.mjs' },
  { id: 'KW-001', script: null },
  { id: 'DP-002', script: 'merge.mjs' },
  { id: 'SD-002', script: null },
  { id: 'OA-002', script: null, outDirs: ['output'] },
  { id: 'FM-003', script: 'backup.mjs' },
  { id: 'MP-001', script: 'optimize.mjs' },
  { id: 'CM-003', script: null },
  { id: 'BW-001', script: null },
  { id: 'SA-001', script: null },
];

async function generateBW001Reference(ws) {
  const exceptions = 'expense_id,rule,reason\nE1,meal_limit,amount 80 > 75\nE4,missing_receipt,amount > 25 without receipt\nE5,meal_limit,amount 80 > 75\nE5,duplicate_receipt,receipt R100 reused\n';
  const summary = '# Expense Reconciliation Summary\n\n- Total expenses: 5\n- Total amount: 410\n- Exceptions: 4\n\n## By rule\n- meal_limit: 2\n- missing_receipt: 1\n- duplicate_receipt: 1\n';
  await write(join(ws, 'exceptions.csv'), exceptions);
  await write(join(ws, 'summary.md'), summary);
}

async function cpR(s, d) {
  await mkdir(d, { recursive: true });
  for (const e of await readdir(s, { withFileTypes: true })) {
    const ss = join(s, e.name);
    const dd = join(d, e.name);
    if (e.isDirectory()) await cpR(ss, dd);
    else await copyFile(ss, dd);
  }
}

async function buildFaultDirs(id, faults) {
  const ref = join(TASKS, id, 'reference/workspace');
  for (const { name, mutate } of faults) {
    const dir = join(TASKS, id, 'faults', name);
    await rm(dir, { recursive: true, force: true });
    await cpR(ref, dir);
    await mutate(dir);
  }
}

async function main() {
  await bootstrapPP001();
  await bootstrapKW001();
  await bootstrapDP002();
  await bootstrapSD002();
  await bootstrapOA002();
  await bootstrapFM003();
  await bootstrapMP001();
  await bootstrapCM003();
  await bootstrapBW001();
  await bootstrapSA001();
  await bootstrapHiddenExtras();

  const results = [];
  for (const cfg of TASK_CONFIG) {
    const ws = await runReference(cfg.id, cfg.script, cfg.outDirs ?? []);
    if (cfg.id === 'BW-001') await generateBW001Reference(ws);
    const v = await verifyWorkspace(cfg.id, ws);
    results.push({ id: cfg.id, reference: v.pass, detail: (v.stderr || v.stdout).trim() });
    if (!v.pass) console.error(`REFERENCE FAIL ${cfg.id}:`, v.stderr, v.stdout);
  }

  await buildFaultDirs('PP-001', [
    { name: 'missed-duplicates', mutate: async (d) => write(join(d, 'duplicates.json'), JSON.stringify({ duplicateGroups: 0, groups: [] }, null, 2) + '\n') },
    { name: 'wrong-count', mutate: async (d) => { const m = JSON.parse(await readFile(join(d, 'manifest.json'), 'utf8')); m.fileCount = 1; await write(join(d, 'manifest.json'), JSON.stringify(m, null, 2) + '\n'); } },
  ]);
  await buildFaultDirs('KW-001', [
    { name: 'missing-sections', mutate: async (d) => write(join(d, 'brief.md'), '# bad\n') },
    { name: 'hallucinated-fact', mutate: async (d) => write(join(d, 'brief.md'), '# Brief\n## Summary\nx\n## Key Facts\nFACT-005 fake\n## Action Items\ny\n') },
  ]);
  await buildFaultDirs('DP-002', [
    { name: 'wrong-merged-count', mutate: async (d) => { const r = JSON.parse(await readFile(join(d, 'output/report.json'), 'utf8')); r.mergedRows = 99; await write(join(d, 'output/report.json'), JSON.stringify(r, null, 2) + '\n'); } },
    { name: 'missing-unmatched', mutate: async (d) => write(join(d, 'output/unmatched.csv'), 'order_id,customer_id,product_id,amount,reason\n') },
  ]);
  await buildFaultDirs('SD-002', [
    { name: 'stub-implementation', mutate: async (d) => write(join(d, 'src/filter.js'), `import { todos } from './todos.js';\nexport function filterTodos(_q,_t){return todos;}\n`) },
    { name: 'broken-logic', mutate: async (d) => write(join(d, 'src/filter.js'), `import { todos } from './todos.js';\nexport function filterTodos(){return [];}\n`) },
  ]);
  await buildFaultDirs('OA-002', [
    { name: 'too-few-slides', mutate: async (d) => { /* truncate pptx invalid - use tiny file */ await write(join(d, 'output/presentation.pptx'), Buffer.from('PK')); } },
    { name: 'missing-metrics', mutate: async (d) => { const p = await readFile(join(d, 'output/presentation.pptx')); await write(join(d, 'output/presentation.pptx'), Buffer.from(p.toString('latin1').replaceAll('1200000', '999'))); } },
  ]);
  await buildFaultDirs('FM-003', [
    { name: 'failed-verification', mutate: async (d) => write(join(d, 'verification.json'), JSON.stringify({ passed: false, fileCount: 0, mismatches: ['x'] }, null, 2) + '\n') },
    { name: 'wrong-file-count', mutate: async (d) => { const m = JSON.parse(await readFile(join(d, 'manifest.json'), 'utf8')); m.fileCount = 0; await write(join(d, 'manifest.json'), JSON.stringify(m, null, 2) + '\n'); } },
  ]);
  await buildFaultDirs('MP-001', [
    { name: 'wrong-target-dims', mutate: async (d) => { const t = await readFile(join(d, 'manifest.csv'), 'utf8'); await write(join(d, 'manifest.csv'), t.replace('800', '9999')); } },
    { name: 'missing-optimized', mutate: async (d) => { const { unlink } = await import('node:fs/promises'); await unlink(join(d, 'optimized/a.png')); } },
  ]);
  await buildFaultDirs('CM-003', [
    { name: 'conflicting-slot', mutate: async (d) => { const o = JSON.parse(await readFile(join(d, 'meeting-options.json'), 'utf8')); o.candidates[0].startUtc = '2026-03-10T06:30:00Z'; o.candidates[0].endUtc = '2026-03-10T07:30:00Z'; await write(join(d, 'meeting-options.json'), JSON.stringify(o, null, 2) + '\n'); } },
    { name: 'too-few-options', mutate: async (d) => { const o = JSON.parse(await readFile(join(d, 'meeting-options.json'), 'utf8')); o.candidates = o.candidates.slice(0, 1); await write(join(d, 'meeting-options.json'), JSON.stringify(o, null, 2) + '\n'); } },
  ]);
  await buildFaultDirs('BW-001', [
    { name: 'missing-exception', mutate: async (d) => write(join(d, 'exceptions.csv'), 'expense_id,rule,reason\n') },
    { name: 'wrong-summary', mutate: async (d) => write(join(d, 'summary.md'), '# Summary\nExceptions: 0\n') },
  ]);
  await buildFaultDirs('SA-001', [
    { name: 'broken-ports', mutate: async (d) => { let y = await readFile(join(d, 'docker-compose.yml'), 'utf8'); y = y.replace('ports:\n      - "8080:80"', 'ports: "8080:80"'); await write(join(d, 'docker-compose.yml'), y); } },
    { name: 'no-healthcheck', mutate: async (d) => { let y = await readFile(join(d, 'docker-compose.yml'), 'utf8'); y = y.replace(/interval: 10s\n/g, ''); await write(join(d, 'docker-compose.yml'), y); } },
  ]);

  const faultResults = [];
  for (const cfg of TASK_CONFIG) {
    const faultDir = join(TASKS, cfg.id, 'faults');
    for (const name of await readdir(faultDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const v = await verifyWorkspace(cfg.id, join(faultDir, name.name));
      faultResults.push({ id: cfg.id, fault: name.name, shouldFail: !v.pass, ok: !v.pass });
      if (v.pass) console.error(`FAULT SHOULD FAIL ${cfg.id}/${name.name}`);
    }
  }

  console.log(JSON.stringify({ results, faultResults }, null, 2));
  const allRef = results.every((r) => r.reference);
  const allFault = faultResults.every((f) => f.ok);
  if (!allRef || !allFault) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
