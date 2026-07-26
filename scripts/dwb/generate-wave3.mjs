#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  harnessHeader, metadataYaml, parseCsv, scaffoldTask, sha256, taskJson, toCsv, writeJson, writeText,
} from './lib/common.mjs';
import { minimalPptx, minimalXlsx, readXlsxSheet, countPptxSlides } from './lib/ooxml.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const h = harnessHeader;

function minimalPdf(label) {
  const content = `BT /F1 18 Tf 50 750 Td (${label}) Tj ET`;
  const stream = `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream`;
  return `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
${stream} endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000270 00000 n 
0000000360 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
420
%%EOF`;
}

function countPdfPages(buf) {
  return (buf.toString('latin1').match(/\/Type \/Page/g) || []).length;
}

async function salesMetrics(csvText) {
  const { rows } = parseCsv(csvText);
  const byRegion = {};
  for (const r of rows) {
    const region = r.region;
    byRegion[region] = (byRegion[region] || 0) + Number(r.amount);
  }
  const sorted = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
  return { total: rows.reduce((s, r) => s + Number(r.amount), 0), topRegion: sorted[0][0], topAmount: sorted[0][1], byRegion };
}

const ALL_TASKS = [];

function addTask(spec) { ALL_TASKS.push(spec); }

// ═══════════════════════════════════════════════════════════════════════════
// PP-002
addTask({
  id: 'PP-002',
  taskJson: taskJson({ id: 'PP-002', title: 'Photo Library Organizer', profile: 'file-organizing', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'personal-productivity',
    prompt: 'input/photos/ 有照片及 input/photo-index.json。按 dateTaken 复制到 output/photos-by-date/YYYY-MM-DD/；缺失 EXIF 用 unknown-date/；重名加 _2；非图片记入 warnings。输出 manifest.csv 与 warnings.json。不修改 input/。',
    requiredFiles: ['output/manifest.csv', 'output/warnings.json'], unchangedPaths: ['input/photo-index.json'] }),
  metadata: metadataYaml({ id: 'PP-002', domain: 'personal-productivity', level: 'D2', artifacts: ['output/photos-by-date/', 'output/manifest.csv', 'output/warnings.json'] }),
  readme: '# PP-002 · Photo Library Organizer\n',
  verify: `${h('PP-002')}
async function main() {
  await assertInputUnchanged(['input/photo-index.json']);
  const index = JSON.parse(await readFile(join(workspace, 'input/photo-index.json'), 'utf8'));
  const man = parseCsv(await readFile(join(workspace, 'output/manifest.csv'), 'utf8'));
  const warn = JSON.parse(await readFile(join(workspace, 'output/warnings.json'), 'utf8'));
  const images = index.items.filter((i) => i.isImage);
  if (man.rows.length !== images.length) fail('manifest count');
  if (!warn.skippedNonImages.includes('photos/notes.txt')) fail('notes not skipped');
  if (!warn.missingExif.includes('photos/c.jpg')) fail('missing exif');
  if (!warn.renamedCollisions.length) fail('collision rename expected');
  for (const row of man.rows) {
    try { await access(join(workspace, 'output', row.dest_path), constants.F_OK); } catch { fail('missing ' + row.dest_path); }
  }
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/photos/album'), { recursive: true });
    const items = [
      { path: 'photos/a.jpg', isImage: true, dateTaken: '2024-03-15T10:00:00' },
      { path: 'photos/shot.jpg', isImage: true, dateTaken: '2024-03-15T11:00:00' },
      { path: 'photos/album/shot.jpg', isImage: true, dateTaken: '2024-03-15T12:00:00' },
      { path: 'photos/c.jpg', isImage: true, dateTaken: null },
      { path: 'photos/notes.txt', isImage: false, dateTaken: null },
    ];
    for (const it of items) await writeText(join(d, 'input', it.path), it.isImage ? 'IMG' : 'notes');
    await writeJson(join(d, 'input/photo-index.json'), { items });
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const index = JSON.parse(await readFile(join(ws, 'input/photo-index.json'), 'utf8'));
    const manifest = []; const warnings = { missingExif: [], skippedNonImages: [], renamedCollisions: [] }; const used = new Map();
    for (const item of index.items) {
      if (!item.isImage) { warnings.skippedNonImages.push(item.path); continue; }
      const folder = item.dateTaken ? item.dateTaken.slice(0, 10) : 'unknown-date';
      if (!item.dateTaken) warnings.missingExif.push(item.path);
      const base = item.path.split('/').pop(); let destName = base;
      const key = folder + '/' + base;
      if (used.has(key)) { const n = used.get(key) + 1; used.set(key, n); const dot = base.lastIndexOf('.'); destName = dot > 0 ? base.slice(0, dot) + '_' + n + base.slice(dot) : base + '_' + n; warnings.renamedCollisions.push({ original: item.path, renamed: destName }); }
      else used.set(key, 1);
      const rel = 'photos-by-date/' + folder + '/' + destName;
      await mkdir(join(ws, 'output', dirname(rel)), { recursive: true });
      await cp(join(ws, 'input', item.path), join(ws, 'output', rel));
      manifest.push({ original_path: item.path, dest_path: rel, date_source: item.dateTaken ? 'exif' : 'unknown' });
    }
    await writeText(join(ws, 'output/manifest.csv'), toCsv(['original_path', 'dest_path', 'date_source'], manifest));
    await writeJson(join(ws, 'output/warnings.json'), warnings);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'skip-warnings'), { recursive: true });
    await writeJson(join(d, 'skip-warnings/output/warnings.json'), { missingExif: [], skippedNonImages: [], renamedCollisions: [] });
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-folder'), { recursive: true });
    await writeText(join(d, 'wrong-folder/output/manifest.csv'), (await readFile(join(d, 'wrong-folder/output/manifest.csv'), 'utf8')).replace('2024-03-15', '2099-01-01'));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'extra/input/photos'), { recursive: true });
    await writeText(join(r, 'extra/input/photos/z.jpg'), 'Z');
    await writeJson(join(r, 'extra/input/photo-index.json'), { items: [{ path: 'photos/z.jpg', isImage: true, dateTaken: '2025-06-01' }] });
  },
});

// PP-003
addTask({
  id: 'PP-003',
  taskJson: taskJson({ id: 'PP-003', title: 'Personal Archive Builder', profile: 'file-organizing', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'personal-productivity',
    prompt: '将 input/documents/ 按 input/rules.json 归档到 output/archive/YYYY/type/，生成 archive-index.csv 与 archive-report.md。原件不得修改。',
    requiredFiles: ['output/archive-index.csv', 'output/archive-report.md'], unchangedPaths: ['input/rules.json'] }),
  metadata: metadataYaml({ id: 'PP-003', domain: 'personal-productivity', level: 'D2', artifacts: ['output/archive/', 'output/archive-index.csv', 'output/archive-report.md'] }),
  readme: '# PP-003 · Personal Archive Builder\n',
  verify: `${h('PP-003')}
async function main() {
  await assertInputUnchanged(['input/rules.json']);
  const rules = JSON.parse(await readFile(join(workspace, 'input/rules.json'), 'utf8'));
  const files = await readdir(join(workspace, 'input/documents'));
  const idx = parseCsv(await readFile(join(workspace, 'output/archive-index.csv'), 'utf8'));
  if (idx.rows.length !== files.length) fail('index count');
  for (const f of files) {
    const year = (/^(\\d{4})-/.exec(f) || [null, rules.defaultYear])[1];
    const ext = f.split('.').pop().toLowerCase();
    const type = rules.types[ext] || 'other';
    try { await access(join(workspace, 'output/archive', year, type, f), constants.F_OK); } catch { fail('missing ' + f); }
    if (!(await readFile(join(workspace, 'input/documents', f))).equals(await readFile(join(workspace, 'output/archive', year, type, f)))) fail('copy mismatch');
  }
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/documents'), { recursive: true });
    await writeJson(join(d, 'input/rules.json'), { defaultYear: '2023', types: { pdf: 'papers', md: 'notes' } });
    await writeText(join(d, 'input/documents/2024-report.pdf'), 'pdf1');
    await writeText(join(d, 'input/documents/2023-memo.md'), '# m');
    await writeText(join(d, 'input/documents/misc.xyz'), 'x');
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const rules = JSON.parse(await readFile(join(ws, 'input/rules.json'), 'utf8'));
    const files = await readdir(join(ws, 'input/documents')); const rows = [];
    for (const f of files) {
      const year = (/^(\d{4})-/.exec(f) || [null, rules.defaultYear])[1];
      const type = rules.types[f.split('.').pop().toLowerCase()] || 'other';
      await mkdir(join(ws, 'output/archive', year, type), { recursive: true });
      await cp(join(ws, 'input/documents', f), join(ws, 'output/archive', year, type, f));
      rows.push({ source_path: 'documents/' + f, archive_path: `archive/${year}/${type}/${f}`, year, type, rule: 'auto' });
    }
    await writeText(join(ws, 'output/archive-index.csv'), toCsv(['source_path', 'archive_path', 'year', 'type', 'rule'], rows));
    await writeText(join(ws, 'output/archive-report.md'), `# Report\
Files: ${files.length}\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'tampered-input'), { recursive: true });
    await writeText(join(d, 'tampered-input/input/documents/2024-report.pdf'), 'BAD');
    await cp(join(d, '../reference/workspace'), join(d, 'short-index'), { recursive: true });
    const idx = parseCsv(await readFile(join(d, 'short-index/output/archive-index.csv'), 'utf8'));
    idx.rows.pop(); await writeText(join(d, 'short-index/output/archive-index.csv'), toCsv(idx.headers, idx.rows));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'extra/input/documents'), { recursive: true });
    await writeJson(join(r, 'extra/input/rules.json'), { defaultYear: '2022', types: { csv: 'data' } });
    await writeText(join(r, 'extra/input/documents/2025-data.csv'), `a\
`);
  },
});

// KW-003, DP-003, SD-003 ... (compact builders)
addTask({
  id: 'KW-003',
  taskJson: taskJson({ id: 'KW-003', title: 'Research Digest', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'knowledge-work',
    prompt: '阅读 input/sources/*.json，输出 digest.md（Themes/Conflicts/Needs Verification）与 evidence-map.json。保留冲突、标记不确定项，不得捏造 sourceId。',
    requiredFiles: ['output/digest.md', 'output/evidence-map.json'], unchangedPaths: ['input/sources/notes-a.json'] }),
  metadata: metadataYaml({ id: 'KW-003', domain: 'knowledge-work', level: 'D2', artifacts: ['output/digest.md', 'output/evidence-map.json'] }),
  readme: '# KW-003 · Research Digest\n',
  verify: `${h('KW-003')}
async function main() {
  const map = JSON.parse(await readFile(join(workspace, 'output/evidence-map.json'), 'utf8'));
  const digest = await readFile(join(workspace, 'output/digest.md'), 'utf8');
  for (const s of ['## Themes','## Conflicts','## Needs Verification']) if (!digest.includes(s)) fail('section '+s);
  if (!map.conflicts?.length || map.conflicts[0].views?.length < 2) fail('conflicts');
  if (map.themes?.[0]?.sourceIds?.includes('src-z')) fail('fabricated id');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/sources'), { recursive: true });
    await writeJson(join(d, 'input/sources/notes-a.json'), { id: 'src-a', claims: [{ text: 'Solid-state by 2027' }], openQuestions: ['cost'] });
    await writeJson(join(d, 'input/sources/notes-b.json'), { id: 'src-b', claims: [{ text: 'Unlikely before 2030' }], openQuestions: [] });
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await writeText(join(ws, 'output/digest.md'), `## Themes\
Battery\
\
## Conflicts\
2027 vs 2030\
\
## Needs Verification\
cost\
`);
    await writeJson(join(ws, 'output/evidence-map.json'), { themes: [{ name: 'Battery', sourceIds: ['src-a','src-b'] }], conflicts: [{ topic: 'date', views: [{ sourceId: 'src-a', claim: '2027' }, { sourceId: 'src-b', claim: '2030' }] }], uncertain: [{ sourceId: 'src-a', note: 'cost' }] });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'no-conflicts'), { recursive: true });
    await writeJson(join(d, 'no-conflicts/output/evidence-map.json'), { themes: [], conflicts: [], uncertain: [] });
    await cp(join(d, '../reference/workspace'), join(d, 'bad-id'), { recursive: true });
    await writeJson(join(d, 'bad-id/output/evidence-map.json'), { themes: [{ sourceIds: ['src-z'] }], conflicts: [{ views: [{ sourceId: 'src-a' }, { sourceId: 'src-b' }] }], uncertain: [] });
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input/sources'), { recursive: true });
    await writeJson(join(r, 'alt/input/sources/notes-a.json'), { id: 'src-a', claims: [{ text: 'Local models rise' }] });
    await writeJson(join(r, 'alt/input/sources/notes-b.json'), { id: 'src-b', claims: [{ text: 'Cloud still leads' }] });
  },
});

addTask({
  id: 'DP-003',
  taskJson: taskJson({ id: 'DP-003', title: 'Reusable Format Converter', profile: 'coding', capabilities: ['read-project', 'edit-code', 'run-tests', 'transform-data'], tags: 'D2', domain: 'data-processing',
    prompt: '实现 converter/convert.mjs 支持 JSON→CSV（dot 键降维）。批量处理 input/batch/，输出 converted/ 与 report.json（含 failed）。',
    requiredFiles: ['output/converted/valid.csv', 'output/report.json', 'converter/convert.mjs'], unchangedPaths: ['input/batch/valid.json'] }),
  metadata: metadataYaml({ id: 'DP-003', domain: 'data-processing', level: 'D2', artifacts: ['converter/', 'output/converted/', 'output/report.json'] }),
  readme: '# DP-003 · Format Converter\n',
  verify: `${h('DP-003')}
import { spawnSync } from 'node:child_process';
async function main() {
  await assertInputUnchanged(['input/batch/valid.json']);
  const csv = await readFile(join(workspace, 'output/converted/valid.csv'), 'utf8');
  if (!csv.includes('user.name') || !csv.includes('Alice')) fail('csv content');
  const rep = JSON.parse(await readFile(join(workspace, 'output/report.json'), 'utf8'));
  if (!rep.failed?.length) fail('need failed entry');
  const tool = join(workspace, 'converter/convert.mjs');
  if (process.env.DWB_HIDDEN_ROOT) {
    try { await access(tool, constants.F_OK); const dirs = await readdir(process.env.DWB_HIDDEN_ROOT, { withFileTypes: true });
      for (const v of dirs.filter(d=>d.isDirectory())) {
        const out = join(workspace, '.h.csv');
        const r = spawnSync(process.execPath, [tool, '--from','json','--to','csv','--in', join(process.env.DWB_HIDDEN_ROOT,v.name,'input/sample.json'), '--out', out]);
        if (r.status !== 0) fail('hidden '+v.name);
      }
    } catch {}
  }
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/batch'), { recursive: true });
    await writeJson(join(d, 'input/batch/valid.json'), { user: { name: 'Alice' }, n: 1 });
    await writeText(join(d, 'input/batch/broken.json'), '{x');
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await mkdir(join(ws, 'converter'), { recursive: true });
    await writeText(join(ws, 'converter/convert.mjs'), `#!/usr/bin/env node
import{readFile,writeFile,mkdir}from'node:fs/promises';import{dirname}from'node:path';
const a=process.argv;const g=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null};
const o=JSON.parse(await readFile(g('--in'),'utf8'));const flat={};
(function w(x,p){for(const[k,v]of Object.entries(x)){const key=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))w(v,key);else flat[key]=v}})(o,'');
const h=Object.keys(flat);await mkdir(dirname(g('--out')),{recursive:true});
await writeFile(g('--out'),h.join(',')+'\
'+h.map(k=>flat[k]).join(',')+'\
');`);
    await mkdir(join(ws, 'output/converted'), { recursive: true });
    spawnSync(process.execPath, [join(ws, 'converter/convert.mjs'), '--from', 'json', '--to', 'csv', '--in', join(ws, 'input/batch/valid.json'), '--out', join(ws, 'output/converted/valid.csv')]);
    await writeJson(join(ws, 'output/report.json'), { processed: 1, failed: [{ file: 'broken.json', reason: 'parse' }], formats: ['json', 'csv'] });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'no-failed'), { recursive: true });
    await writeJson(join(d, 'no-failed/output/report.json'), { processed: 2, failed: [] });
    await cp(join(d, '../reference/workspace'), join(d, 'bad-csv'), { recursive: true });
    await writeText(join(d, 'bad-csv/output/converted/valid.csv'), `x\
1\
`);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeJson(join(r, 'alt/input/sample.json'), { hidden: true, user: { name: 'H' } });
  },
});

// SD-003 Dependency Upgrade
addTask({
  id: 'SD-003',
  taskJson: taskJson({ id: 'SD-003', title: 'Dependency Upgrade', profile: 'coding', capabilities: ['read-project', 'edit-code', 'run-tests', 'inspect-git-diff'], tags: 'D2', domain: 'software-development',
    prompt: 'fixture 中 mini-app 使用旧版 semver 库（compare(a,b) 返回 -1/0/1）。升级到 package.json 指定的新 API（semver.compare）并修复 src/app.js，通过 npm test。写 output/migration-note.md 说明变更。',
    requiredFiles: ['output/migration-note.md'], unchangedPaths: ['test/app.test.js', 'package-lock.json'] }),
  metadata: metadataYaml({ id: 'SD-003', domain: 'software-development', level: 'D2', artifacts: ['output/migration-note.md', 'source changes'] }),
  readme: '# SD-003 · Dependency Upgrade\n\n升级 semver 并修复破坏性 API。\n',
  verify: `${h('SD-003')}
import { spawnSync } from 'node:child_process';
async function main() {
  await assertInputUnchanged(['test/app.test.js']);
  const pkg = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'));
  if (!pkg.dependencies?.semver || pkg.dependencies.semver.startsWith('6')) fail('semver not upgraded');
  const src = await readFile(join(workspace, 'src/app.js'), 'utf8');
  if (!src.includes('semver.compare')) fail('must use semver.compare');
  const note = await readFile(join(workspace, 'output/migration-note.md'), 'utf8');
  if (!note.toLowerCase().includes('semver')) fail('migration note');
  try {
    await access(join(workspace, 'node_modules/semver'), constants.F_OK);
    const r = spawnSync('npm', ['test'], { cwd: workspace, shell: true, encoding: 'utf8' });
    if (r.status !== 0) fail('tests failed');
  } catch { /* skip npm test when node_modules absent in reference snapshot */ }
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeJson(join(d, 'package.json'), { name: 'mini-app', type: 'module', scripts: { test: 'node --test test/app.test.js' }, dependencies: { semver: '6.3.1' } });
    await mkdir(join(d, 'src'), { recursive: true });
    await mkdir(join(d, 'test'), { recursive: true });
    await writeText(join(d, 'src/app.js'), "import semver from 'semver';\nexport function isNewer(a, b) { return semver(a, b) > 0; }\n");
    await writeText(join(d, 'test/app.test.js'), "import test from 'node:test'; import assert from 'node:assert/strict'; import { isNewer } from '../src/app.js';\ntest('newer', () => assert.equal(isNewer('2.0.0','1.0.0'), true));\n");
    await writeText(join(d, 'package-lock.json'), `{}
`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await writeJson(join(ws, 'package.json'), { name: 'mini-app', type: 'module', scripts: { test: 'node --test test/app.test.js' }, dependencies: { semver: '7.6.3' } });
    await writeText(join(ws, 'src/app.js'), "import semver from 'semver';\nexport function isNewer(a, b) { return semver.compare(a, b) > 0; }\n");
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/migration-note.md'), `Upgraded semver 6→7; use semver.compare instead of semver().
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'not-upgraded'), { recursive: true });
    await writeJson(join(d, 'not-upgraded/package.json'), { name: 'mini-app', type: 'module', scripts: { test: 'node --test test/app.test.js' }, dependencies: { semver: '6.3.1' } });
    await cp(join(d, '../reference/workspace'), join(d, 'no-note'), { recursive: true });
    await stat(join(d, 'no-note/output/migration-note.md')).then(() => writeFile(join(d, 'no-note/output/migration-note.md'), 'done\n'));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt-fixture/test'), { recursive: true });
    await writeJson(join(r, 'alt-fixture/package.json'), { name: 'alt', type: 'module', scripts: { test: 'node --test test/app.test.js' }, dependencies: { semver: '6.3.1' } });
    await writeText(join(r, 'alt-fixture/src/app.js'), "import semver from 'semver';\nexport function isNewer(a,b){return semver(a,b)>0;}\n");
    await writeText(join(r, 'alt-fixture/test/app.test.js'), "import test from 'node:test';import assert from 'node:assert/strict';import{isNewer}from'../src/app.js';test('x',()=>assert.ok(isNewer('2.0.0','1.0.0')));\n");
  },
});

// OA-003 - use report-data.json + report.md (docx deviation documented)
addTask({
  id: 'OA-003',
  taskJson: taskJson({ id: 'OA-003', title: 'Document Report Generator', profile: 'office', capabilities: ['read-project', 'transform-data', 'inspect-spreadsheet'], tags: 'D2', domain: 'office-automation',
    prompt: '根据 input/sales.csv 与 input/template.md 生成 output/report-data.json（结构化报告数据）与 output/report.md（正式报告，含摘要、表格、结论）。保持 template 章节结构。README 说明：v1 用 Markdown 代替 docx。',
    requiredFiles: ['output/report-data.json', 'output/report.md'], unchangedPaths: ['input/sales.csv', 'input/template.md'] }),
  metadata: metadataYaml({ id: 'OA-003', domain: 'office-automation', level: 'D2', artifacts: ['output/report-data.json', 'output/report.md'] }),
  readme: '# OA-003 · Document Report Generator\n\n**Deviation:** v1 以 report.md 代替 report.docx；数据在 report-data.json。\n',
  verify: `${h('OA-003')}
async function main() {
  await assertInputUnchanged(['input/sales.csv']);
  const data = JSON.parse(await readFile(join(workspace, 'output/report-data.json'), 'utf8'));
  const csv = parseCsv(await readFile(join(workspace, 'input/sales.csv'), 'utf8'));
  const expectedTotal = csv.rows.reduce((s,r)=>s+Number(r.revenue),0);
  if (data.totalRevenue !== expectedTotal) fail('total revenue');
  const md = await readFile(join(workspace, 'output/report.md'), 'utf8');
  for (const s of ['## Summary','## Table','## Conclusion']) if (!md.includes(s)) fail('section '+s);
  if (!md.includes(String(expectedTotal))) fail('total in report');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeText(join(d, 'input/sales.csv'), `region,revenue\
North,100\
South,150\
`);
    await writeText(join(d, 'input/template.md'), `# Report\
## Summary\
## Table\
## Conclusion\
`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const csv = parseCsv(await readFile(join(ws, 'input/sales.csv'), 'utf8'));
    const total = csv.rows.reduce((s, r) => s + Number(r.revenue), 0);
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeJson(join(ws, 'output/report-data.json'), { totalRevenue: total, rows: csv.rows });
    await writeText(join(ws, 'output/report.md'), `## Summary\
Total: ${total}\
\
## Table\
| region | revenue |\
| North | 100 |\
| South | 150 |\
\
## Conclusion\
Revenue balanced.\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-total'), { recursive: true });
    await writeJson(join(d, 'wrong-total/output/report-data.json'), { totalRevenue: 0, rows: [] });
    await cp(join(d, '../reference/workspace'), join(d, 'missing-section'), { recursive: true });
    await writeText(join(d, 'missing-section/output/report.md'), `## Summary\
only\
`);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeText(join(r, 'alt/input/sales.csv'), `region,revenue\
East,200\
`);
    await writeText(join(r, 'alt/input/template.md'), `# T\
## Summary\
## Table\
## Conclusion\
`);
  },
});

// FM-001
addTask({
  id: 'FM-001',
  taskJson: taskJson({ id: 'FM-001', title: 'Duplicate File Audit', profile: 'file-organizing', capabilities: ['read-project', 'transform-data'], tags: 'D1', domain: 'file-management',
    prompt: '递归扫描 input/tree/，按 SHA256 找完全重复；同名不同内容为 suspected。输出 duplicates.json 与 audit.md。不得删除或修改任何文件。',
    requiredFiles: ['output/duplicates.json', 'output/audit.md'], unchangedPaths: ['input/tree/a.txt'] }),
  metadata: metadataYaml({ id: 'FM-001', domain: 'file-management', level: 'D1', artifacts: ['output/duplicates.json', 'output/audit.md'] }),
  readme: '# FM-001 · Duplicate File Audit\n',
  verify: `${h('FM-001')}
import { createHash } from 'node:crypto';
async function hash(p){return createHash('sha256').update(await readFile(join(workspace,p))).digest('hex');}
async function main() {
  await assertInputUnchanged(['input/tree/a.txt']);
  const dup = JSON.parse(await readFile(join(workspace, 'output/duplicates.json'), 'utf8'));
  const h1 = await hash('input/tree/dup1.txt'); const h2 = await hash('input/tree/sub/dup2.txt');
  if (h1 !== h2) fail('fixture dup mismatch');
  const group = dup.exact?.find(g=>g.hash===h1);
  if (!group || group.files.length < 2) fail('exact dup group');
  if (!dup.suspected?.length) fail('suspected needed');
  const audit = await readFile(join(workspace, 'output/audit.md'), 'utf8');
  if (!audit.includes('wastedBytes') && !audit.includes('space')) fail('audit stats');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/tree/sub'), { recursive: true });
    await writeText(join(d, 'input/tree/a.txt'), 'unique-a');
    await writeText(join(d, 'input/tree/dup1.txt'), 'same-content');
    await writeText(join(d, 'input/tree/sub/dup2.txt'), 'same-content');
    await writeText(join(d, 'input/tree/readme.txt'), 'readme-v1');
    await writeText(join(d, 'input/tree/sub/readme.txt'), 'readme-v2');
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const h = sha256(await readFile(join(ws, 'input/tree/dup1.txt')));
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeJson(join(ws, 'output/duplicates.json'), { exact: [{ hash: h, files: ['input/tree/dup1.txt', 'input/tree/sub/dup2.txt'], wastedBytes: 13 }], suspected: [{ name: 'readme.txt', files: ['input/tree/readme.txt', 'input/tree/sub/readme.txt'] }] });
    await writeText(join(ws, 'output/audit.md'), `# Audit\
Exact groups: 1\
Wasted space: 13 bytes\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'merged-types'), { recursive: true });
    await writeJson(join(d, 'merged-types/output/duplicates.json'), { exact: [], suspected: [] });
    await cp(join(d, '../reference/workspace'), join(d, 'deleted-file'), { recursive: true });
    await writeText(join(d, 'deleted-file/input/tree/a.txt'), 'GONE');
  },
  async buildHidden(r) {
    await mkdir(join(r, 'extra/input/tree'), { recursive: true });
    await writeText(join(r, 'extra/input/tree/x.txt'), 'same-content');
    await writeText(join(r, 'extra/input/tree/y.txt'), 'same-content');
  },
});

// MP-002 PDF Packet Builder
addTask({
  id: 'MP-002',
  taskJson: taskJson({ id: 'MP-002', title: 'PDF Packet Builder', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'media-processing',
    prompt: '按 input/manifest.json 顺序合并 input/pdfs/*.pdf，前置 cover 与 toc 页（各 1 页 PDF），输出 output/packet.pdf 与 output/packet-manifest.json（sections, totalPages, order）。',
    requiredFiles: ['output/packet.pdf', 'output/packet-manifest.json'], unchangedPaths: ['input/manifest.json'] }),
  metadata: metadataYaml({ id: 'MP-002', domain: 'media-processing', level: 'D2', artifacts: ['output/packet.pdf', 'output/packet-manifest.json'] }),
  readme: '# MP-002 · PDF Packet Builder\n\n合并 PDF 并验证页数顺序。\n',
  verify: `${h('MP-002')}
async function main() {
  await assertInputUnchanged(['input/manifest.json']);
  const man = JSON.parse(await readFile(join(workspace, 'output/packet-manifest.json'), 'utf8'));
  const expected = JSON.parse(await readFile(join(workspace, 'input/manifest.json'), 'utf8'));
  if (JSON.stringify(man.order) !== JSON.stringify(['cover','toc',...expected.files])) fail('order');
  const pdf = await readFile(join(workspace, 'output/packet.pdf'));
  const pages = (pdf.toString('latin1').match(/\\/Type \\/Page/g)||[]).length;
  if (pages !== man.totalPages) fail('page count');
  if (pages !== 2 + expected.files.length) fail('expected pages');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/pdfs'), { recursive: true });
    await writeJson(join(d, 'input/manifest.json'), { files: ['a.pdf', 'b.pdf'] });
    await writeText(join(d, 'input/pdfs/a.pdf'), minimalPdf('A'));
    await writeText(join(d, 'input/pdfs/b.pdf'), minimalPdf('B'));
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const order = ['cover', 'toc', 'a.pdf', 'b.pdf'];
    const body = [minimalPdf('Cover'), minimalPdf('TOC'), minimalPdf('A'), minimalPdf('B')].join('\\n');
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/packet.pdf'), body);
    await writeJson(join(ws, 'output/packet-manifest.json'), { order, sections: order, totalPages: 4 });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-order'), { recursive: true });
    await writeJson(join(d, 'wrong-order/output/packet-manifest.json'), { order: ['a.pdf','cover'], sections: [], totalPages: 4 });
    await cp(join(d, '../reference/workspace'), join(d, 'short-pdf'), { recursive: true });
    await writeText(join(d, 'short-pdf/output/packet.pdf'), minimalPdf('only'));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'three/input/pdfs'), { recursive: true });
    await writeJson(join(r, 'three/input/manifest.json'), { files: ['c.pdf'] });
    await writeText(join(r, 'three/input/pdfs/c.pdf'), minimalPdf('C'));
  },
});

// MP-003
addTask({
  id: 'MP-003',
  taskJson: taskJson({ id: 'MP-003', title: 'Audio Transcript Package', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'media-processing',
    prompt: '整理 input/raw-transcript.vtt 与 input/speakers.json，输出 transcript.md、segments.csv（start,end,speaker,text）、summary.md。时间戳单调，文本完整。',
    requiredFiles: ['output/transcript.md', 'output/segments.csv', 'output/summary.md'], unchangedPaths: ['input/raw-transcript.vtt'] }),
  metadata: metadataYaml({ id: 'MP-003', domain: 'media-processing', level: 'D2', artifacts: ['output/transcript.md', 'output/segments.csv', 'output/summary.md'] }),
  readme: '# MP-003 · Audio Transcript Package\n',
  verify: `${h('MP-003')}
async function main() {
  await assertInputUnchanged(['input/raw-transcript.vtt']);
  const seg = parseCsv(await readFile(join(workspace, 'output/segments.csv'), 'utf8'));
  if (seg.rows.length < 2) fail('segments');
  let prev = -1;
  for (const r of seg.rows) { const t = parseFloat(r.start); if (t < prev) fail('timestamps'); prev = t; }
  const sum = await readFile(join(workspace, 'output/summary.md'), 'utf8');
  if (!sum.includes('Alice') || !sum.includes('deadline')) fail('summary content');
  const raw = await readFile(join(workspace, 'input/raw-transcript.vtt'), 'utf8');
  if (!raw.includes(seg.rows[0].text.slice(0,5))) fail('text lost');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeText(join(d, 'input/raw-transcript.vtt'), `WEBVTT\
\
00:00:01.000 --> 00:00:04.000\
<v Alice>We need the deadline Friday.\
\
00:00:05.000 --> 00:00:08.000\
<v Bob>Agreed, I will send specs.\
`);
    await writeJson(join(d, 'input/speakers.json'), { Alice: 'PM', Bob: 'Engineer' });
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const rows = [
      { start: '1.000', end: '4.000', speaker: 'Alice', text: 'We need the deadline Friday.' },
      { start: '5.000', end: '8.000', speaker: 'Bob', text: 'Agreed, I will send specs.' },
    ];
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/segments.csv'), toCsv(['start', 'end', 'speaker', 'text'], rows));
    await writeText(join(ws, 'output/transcript.md'), rows.map(r => `[${r.start}] ${r.speaker}: ${r.text}`).join('\\n') + '\\n');
    await writeText(join(ws, 'output/summary.md'), `Alice (PM) set Friday deadline. Bob will send specs.\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'bad-order'), { recursive: true });
    await writeText(join(d, 'bad-order/output/segments.csv'), toCsv(['start','end','speaker','text'], [{ start:'9', end:'10', speaker:'Bob', text:'x' }, { start:'1', end:'2', speaker:'Alice', text:'y' }]));
    await cp(join(d, '../reference/workspace'), join(d, 'empty-summary'), { recursive: true });
    await writeText(join(d, 'empty-summary/output/summary.md'), `nothing\
`);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeText(join(r, 'alt/input/raw-transcript.vtt'), `WEBVTT\
\
00:00:00.000 --> 00:00:02.000\
<v Chen>Hello team.\
`);
    await writeJson(join(r, 'alt/input/speakers.json'), { Chen: 'Lead' });
  },
});

// IW-001
addTask({
  id: 'IW-001',
  taskJson: taskJson({ id: 'IW-001', title: 'Offline Web Data Extraction', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'internet-workflow',
    prompt: '从 input/catalog.html 提取产品（data-sku, name, price），去重输出 output/items.csv 与 output/extraction-report.json（found, duplicates, missingPrice）。离线处理。',
    requiredFiles: ['output/items.csv', 'output/extraction-report.json'], unchangedPaths: ['input/catalog.html'] }),
  metadata: metadataYaml({ id: 'IW-001', domain: 'internet-workflow', level: 'D2', artifacts: ['output/items.csv', 'output/extraction-report.json'] }),
  readme: '# IW-001 · Offline Web Extraction\n',
  verify: `${h('IW-001')}
async function main() {
  await assertInputUnchanged(['input/catalog.html']);
  const items = parseCsv(await readFile(join(workspace, 'output/items.csv'), 'utf8'));
  const rep = JSON.parse(await readFile(join(workspace, 'output/extraction-report.json'), 'utf8'));
  if (items.rows.length !== 3) fail('item count');
  if (!items.rows.find(r=>r.sku==='SKU-1' && r.price==='9.99')) fail('SKU-1');
  if (rep.duplicates < 1) fail('dup count');
  if (rep.missingPrice < 1) fail('missing price');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeText(join(d, 'input/catalog.html'), `<html><body>
<div class="product" data-sku="SKU-1"><span class="name">Widget</span><span class="price">9.99</span></div>
<div class="product" data-sku="SKU-1"><span class="name">Widget Dup</span><span class="price">9.99</span></div>
<div class="product" data-sku="SKU-2"><span class="name">Gadget</span><span class="price"></span></div>
<div class="product" data-sku="SKU-3"><span class="name">Tool</span><span class="price">4.50</span></div>
</body></html>`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const rows = [
      { sku: 'SKU-1', name: 'Widget', price: '9.99' },
      { sku: 'SKU-2', name: 'Gadget', price: '' },
      { sku: 'SKU-3', name: 'Tool', price: '4.50' },
    ];
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/items.csv'), toCsv(['sku', 'name', 'price'], rows));
    await writeJson(join(ws, 'output/extraction-report.json'), { found: 4, duplicates: 1, missingPrice: 1 });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'extra-dup'), { recursive: true });
    await writeJson(join(d, 'extra-dup/output/extraction-report.json'), { found: 4, duplicates: 0, missingPrice: 1 });
    await cp(join(d, '../reference/workspace'), join(d, 'missing-sku'), { recursive: true });
    const items = parseCsv(await readFile(join(d, 'missing-sku/output/items.csv'), 'utf8'));
    items.rows.pop(); await writeText(join(d, 'missing-sku/output/items.csv'), toCsv(items.headers, items.rows));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeText(join(r, 'alt/input/catalog.html'), '<div class="product" data-sku="H1"><span class="name">Hidden</span><span class="price">1.00</span></div>');
  },
});

// IW-002
addTask({
  id: 'IW-002',
  taskJson: taskJson({ id: 'IW-002', title: 'RSS Digest from Fixtures', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D1', domain: 'internet-workflow',
    prompt: '读取 input/feeds/ 下 RSS 与 Atom，按 GUID/链接去重，时间降序，分类写入 output/rss-digest.md 与 output/items.json。',
    requiredFiles: ['output/rss-digest.md', 'output/items.json'], unchangedPaths: ['input/feeds/news.rss'] }),
  metadata: metadataYaml({ id: 'IW-002', domain: 'internet-workflow', level: 'D1', artifacts: ['output/rss-digest.md', 'output/items.json'] }),
  readme: '# IW-002 · RSS Digest\n',
  verify: `${h('IW-002')}
async function main() {
  const items = JSON.parse(await readFile(join(workspace, 'output/items.json'), 'utf8'));
  if (items.length !== 3) fail('dedup count');
  const ids = new Set(items.map(i=>i.id));
  if (ids.size !== 3) fail('unique ids');
  const times = items.map(i=>Date.parse(i.published));
  for (let i=1;i<times.length;i++) if (times[i]>times[i-1]) fail('sort');
  const md = await readFile(join(workspace, 'output/rss-digest.md'), 'utf8');
  if (!md.includes('tech') || !md.includes('biz')) fail('categories');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/feeds'), { recursive: true });
    await writeText(join(d, 'input/feeds/news.rss'), `<?xml version="1.0"?><rss><channel>
<item><guid>g1</guid><link>http://x/1</link><title>Alpha</title><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate><category>tech</category></item>
<item><guid>g1</guid><link>http://x/1</link><title>Alpha dup</title><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item>
<item><guid>g2</guid><link>http://x/2</link><title>Beta</title><pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate><category>biz</category></item>
</channel></rss>`);
    await writeText(join(d, 'input/feeds/blog.atom'), `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>g3</id><link href="http://x/3"/><title>Gamma</title><updated>2024-01-03T12:00:00Z</updated><category term="tech"/></entry>
</feed>`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const items = [
      { id: 'g3', title: 'Gamma', published: '2024-01-03T12:00:00Z', category: 'tech', source: 'blog.atom' },
      { id: 'g2', title: 'Beta', published: 'Tue, 02 Jan 2024 12:00:00 GMT', category: 'biz', source: 'news.rss' },
      { id: 'g1', title: 'Alpha', published: 'Mon, 01 Jan 2024 12:00:00 GMT', category: 'tech', source: 'news.rss' },
    ];
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeJson(join(ws, 'output/items.json'), items);
    await writeText(join(ws, 'output/rss-digest.md'), `## tech\
- Gamma\
- Alpha\
\
## biz\
- Beta\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'no-dedup'), { recursive: true });
    const items = JSON.parse(await readFile(join(d, 'no-dedup/output/items.json'), 'utf8'));
    items.push({ id: 'g1', title: 'dup' }); await writeJson(join(d, 'no-dedup/output/items.json'), items);
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-sort'), { recursive: true });
    await writeJson(join(d, 'wrong-sort/output/items.json'), [{ id: 'g1' }, { id: 'g3' }]);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input/feeds'), { recursive: true });
    await writeText(join(r, 'alt/input/feeds/extra.rss'), '<rss><channel><item><guid>x</guid><link>http://x</link><title>X</title><pubDate>Wed, 03 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>');
  },
});

// IW-003
addTask({
  id: 'IW-003',
  taskJson: taskJson({ id: 'IW-003', title: 'Resumable Download Plan', profile: 'file-organizing', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'internet-workflow',
    prompt: '根据 input/urls.txt 与 input/existing/ 已有文件，生成 output/download-plan.json、output/naming-map.csv、output/README.md。合并重复 URL，处理命名冲突，标记已下载项。不联网。',
    requiredFiles: ['output/download-plan.json', 'output/naming-map.csv', 'output/README.md'], unchangedPaths: ['input/urls.txt'] }),
  metadata: metadataYaml({ id: 'IW-003', domain: 'internet-workflow', level: 'D2', artifacts: ['output/download-plan.json', 'output/naming-map.csv', 'output/README.md'] }),
  readme: '# IW-003 · Download Plan\n',
  verify: `${h('IW-003')}
async function main() {
  await assertInputUnchanged(['input/urls.txt']);
  const plan = JSON.parse(await readFile(join(workspace, 'output/download-plan.json'), 'utf8'));
  if (plan.tasks.length !== 3) fail('deduped tasks');
  if (!plan.tasks.some(t=>t.status==='exists')) fail('existing file');
  const map = parseCsv(await readFile(join(workspace, 'output/naming-map.csv'), 'utf8'));
  if (map.rows.length !== 3) fail('naming rows');
  const names = map.rows.map(r=>r.local_name);
  if (new Set(names).size !== names.length) fail('name collision unresolved');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/existing'), { recursive: true });
    await writeText(join(d, 'input/urls.txt'), `http://cdn/a.zip\
http://cdn/b.pdf\
http://cdn/a.zip\
http://cdn/report.pdf\
`);
    await writeText(join(d, 'input/existing/a.zip'), 'partial');
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeJson(join(ws, 'output/download-plan.json'), {
      tasks: [
        { url: 'http://cdn/a.zip', local: 'a.zip', status: 'exists' },
        { url: 'http://cdn/b.pdf', local: 'b.pdf', status: 'pending' },
        { url: 'http://cdn/report.pdf', local: 'report.pdf', status: 'pending' },
      ],
    });
    await writeText(join(ws, 'output/naming-map.csv'), toCsv(['url', 'local_name'], [
      { url: 'http://cdn/a.zip', local_name: 'a.zip' },
      { url: 'http://cdn/b.pdf', local_name: 'b.pdf' },
      { url: 'http://cdn/report.pdf', local_name: 'report.pdf' },
    ]));
    await writeText(join(ws, 'output/README.md'), `# Plan\
Resume supported.\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'dup-urls'), { recursive: true });
    const p = JSON.parse(await readFile(join(d, 'dup-urls/output/download-plan.json'), 'utf8'));
    p.tasks.push({ url: 'http://cdn/a.zip', local: 'a2.zip', status: 'pending' });
    await writeJson(join(d, 'dup-urls/output/download-plan.json'), p);
    await cp(join(d, '../reference/workspace'), join(d, 'ignore-existing'), { recursive: true });
    const p2 = JSON.parse(await readFile(join(d, 'ignore-existing/output/download-plan.json'), 'utf8'));
    p2.tasks[0].status = 'pending'; await writeJson(join(d, 'ignore-existing/output/download-plan.json'), p2);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input/existing'), { recursive: true });
    await writeText(join(r, 'alt/input/urls.txt'), `http://cdn/new.bin\
`);
  },
});

// CM-001
addTask({
  id: 'CM-001',
  taskJson: taskJson({ id: 'CM-001', title: 'Inbox Triage from Mail Export', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'communication',
    prompt: '处理 input/mailbox.json：分类、优先级(P1-P3)、附件索引。输出 triage.csv、attachment-index.csv、summary.md。不发送或删除邮件。',
    requiredFiles: ['output/triage.csv', 'output/attachment-index.csv', 'output/summary.md'], unchangedPaths: ['input/mailbox.json'] }),
  metadata: metadataYaml({ id: 'CM-001', domain: 'communication', level: 'D2', artifacts: ['output/triage.csv', 'output/attachment-index.csv', 'output/summary.md'] }),
  readme: '# CM-001 · Inbox Triage\n',
  verify: `${h('CM-001')}
async function main() {
  await assertInputUnchanged(['input/mailbox.json']);
  const mail = JSON.parse(await readFile(join(workspace, 'input/mailbox.json'), 'utf8'));
  const tri = parseCsv(await readFile(join(workspace, 'output/triage.csv'), 'utf8'));
  if (tri.rows.length !== mail.messages.length) fail('coverage');
  const att = parseCsv(await readFile(join(workspace, 'output/attachment-index.csv'), 'utf8'));
  if (att.rows.length !== 2) fail('attachments');
  if (!tri.rows.find(r=>r.message_id==='m2' && r.priority==='P1')) fail('P1 rule');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeJson(join(d, 'input/mailbox.json'), {
      messages: [
        { id: 'm1', subject: 'Newsletter', from: 'news@x.com', labels: ['promo'], attachments: [] },
        { id: 'm2', subject: 'Production down', from: 'ops@co.com', labels: ['incident'], attachments: [{ name: 'log.txt', size: 100 }] },
        { id: 'm3', subject: 'Invoice', from: 'ap@v.com', labels: ['finance'], attachments: [{ name: 'inv.pdf', size: 200 }] },
      ],
    });
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/triage.csv'), toCsv(['message_id', 'category', 'priority'], [
      { message_id: 'm1', category: 'promo', priority: 'P3' },
      { message_id: 'm2', category: 'incident', priority: 'P1' },
      { message_id: 'm3', category: 'finance', priority: 'P2' },
    ]));
    await writeText(join(ws, 'output/attachment-index.csv'), toCsv(['message_id', 'filename', 'size'], [
      { message_id: 'm2', filename: 'log.txt', size: '100' },
      { message_id: 'm3', filename: 'inv.pdf', size: '200' },
    ]));
    await writeText(join(ws, 'output/summary.md'), `P1: 1 incident. Attachments: 2.\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'missing-mail'), { recursive: true });
    const tri = parseCsv(await readFile(join(d, 'missing-mail/output/triage.csv'), 'utf8'));
    tri.rows.pop(); await writeText(join(d, 'missing-mail/output/triage.csv'), toCsv(tri.headers, tri.rows));
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-priority'), { recursive: true });
    await writeText(join(d, 'wrong-priority/output/triage.csv'), (await readFile(join(d, 'wrong-priority/output/triage.csv'), 'utf8')).replace('P1', 'P3'));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeJson(join(r, 'alt/input/mailbox.json'), { messages: [{ id: 'x1', subject: 'Hi', from: 'a@b.com', labels: [], attachments: [] }] });
  },
});

// CM-002
addTask({
  id: 'CM-002',
  taskJson: taskJson({ id: 'CM-002', title: 'Grounded Reply Drafts', profile: 'general', capabilities: ['read-project', 'transform-data'], tags: 'D2', domain: 'communication',
    prompt: '为 input/threads.json 每线程写 output/drafts/<thread_id>.md 与 output/draft-index.json。严格依据上下文，标记 missing_info，不臆造承诺。',
    requiredFiles: ['output/draft-index.json'], unchangedPaths: ['input/threads.json'] }),
  metadata: metadataYaml({ id: 'CM-002', domain: 'communication', level: 'D2', artifacts: ['output/drafts/', 'output/draft-index.json'] }),
  readme: '# CM-002 · Grounded Reply Drafts\n',
  verify: `${h('CM-002')}
async function main() {
  await assertInputUnchanged(['input/threads.json']);
  const threads = JSON.parse(await readFile(join(workspace, 'input/threads.json'), 'utf8'));
  const idx = JSON.parse(await readFile(join(workspace, 'output/draft-index.json'), 'utf8'));
  if (idx.threads.length !== threads.length) fail('thread count');
  for (const t of threads) {
    try { await access(join(workspace, 'output/drafts', t.id + '.md'), constants.F_OK); } catch { fail('draft '+t.id); }
    const body = await readFile(join(workspace, 'output/drafts', t.id + '.md'), 'utf8');
    if (t.needsDate && !body.toLowerCase().includes('missing')) fail('missing info '+t.id);
    if (body.includes('guarantee refund')) fail('fabricated promise');
  }
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeJson(join(d, 'input/threads.json'), {
      threads: [
        { id: 't1', customer: 'Acme', lastMessage: 'When will the patch ship?', needsDate: true },
        { id: 't2', customer: 'Beta', lastMessage: 'Thanks for the quick fix.', needsDate: false },
      ],
    });
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await mkdir(join(ws, 'output/drafts'), { recursive: true });
    await writeText(join(ws, 'output/drafts/t1.md'), `Hi Acme,\
We are preparing the patch. **Missing:** exact ship date from engineering.\
`);
    await writeText(join(ws, 'output/drafts/t2.md'), `Hi Beta, glad the fix helped.\
`);
    await writeJson(join(ws, 'output/draft-index.json'), { threads: [{ id: 't1', missingInfo: ['ship date'] }, { id: 't2', missingInfo: [] }] });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'fabricated'), { recursive: true });
    await writeText(join(d, 'fabricated/output/drafts/t1.md'), `We guarantee refund and ship tomorrow.\
`);
    await cp(join(d, '../reference/workspace'), join(d, 'missing-draft'), { recursive: true });
    const { unlink } = await import('node:fs/promises');
    await unlink(join(d, 'missing-draft/output/drafts/t2.md')).catch(() => {});
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeJson(join(r, 'alt/input/threads.json'), { threads: [{ id: 't9', customer: 'X', lastMessage: 'Status?', needsDate: true }] });
  },
});

// BW-002
addTask({
  id: 'BW-002',
  taskJson: taskJson({ id: 'BW-002', title: 'Sales Performance Pack', profile: 'office', capabilities: ['read-project', 'transform-data', 'inspect-spreadsheet', 'create-pptx', 'validate-pptx'], tags: 'D3', domain: 'business-workflow',
    prompt: '分析 input/sales.csv，生成 output/sales-analysis.xlsx（区域汇总）、output/management-brief.pptx（≥3 页，含 top region）、output/metrics.json。跨文件数字一致。',
    requiredFiles: ['output/sales-analysis.xlsx', 'output/management-brief.pptx', 'output/metrics.json'], unchangedPaths: ['input/sales.csv'] }),
  metadata: metadataYaml({ id: 'BW-002', domain: 'business-workflow', level: 'D3', artifacts: ['output/sales-analysis.xlsx', 'output/management-brief.pptx', 'output/metrics.json'] }),
  readme: '# BW-002 · Sales Performance Pack\n\nMinimal OOXML xlsx/pptx via zip XML.\n',
  verify: `${h('BW-002')}
async function main() {
  await assertInputUnchanged(['input/sales.csv']);
  const csv = parseCsv(await readFile(join(workspace, 'input/sales.csv'), 'utf8'));
  const total = csv.rows.reduce((s,r)=>s+Number(r.amount),0);
  const byReg = {};
  csv.rows.forEach(r=>{ byReg[r.region]=(byReg[r.region]||0)+Number(r.amount); });
  const top = Object.entries(byReg).sort((a,b)=>b[1]-a[1])[0];
  const met = JSON.parse(await readFile(join(workspace, 'output/metrics.json'), 'utf8'));
  if (met.total !== total) fail('metrics total');
  if (met.topRegion !== top[0]) fail('top region');
  try { await access(join(workspace, 'output/sales-analysis.xlsx'), constants.F_OK); } catch { fail('xlsx missing'); }
  if (met.pptSlideCount < 3) fail('slides metadata');
  try { await access(join(workspace, 'output/management-brief.pptx'), constants.F_OK); } catch { fail('ppt missing'); }
  const ppt = await readFile(join(workspace, 'output/management-brief.pptx'));
  if (ppt.length < 200) fail('ppt too small');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeText(join(d, 'input/sales.csv'), `region,product,amount
North,A,100
North,B,50
South,A,80
East,C,120
`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const csv = parseCsv(await readFile(join(ws, 'input/sales.csv'), 'utf8'));
    const byReg = {}; csv.rows.forEach(r => { byReg[r.region] = (byReg[r.region] || 0) + Number(r.amount); });
    const top = Object.entries(byReg).sort((a, b) => b[1] - a[1])[0];
    const total = csv.rows.reduce((s, r) => s + Number(r.amount), 0);
    const xrows = [['region', 'total'], ...Object.entries(byReg).map(([k, v]) => [k, String(v)])];
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeFile(join(ws, 'output/sales-analysis.xlsx'), minimalXlsx('Summary', xrows));
    const slides = ['Sales Performance', `Top region: ${top[0]} (${top[1]})`, `Total revenue: ${total}`];
    await writeFile(join(ws, 'output/management-brief.pptx'), minimalPptx(slides));
    await writeJson(join(ws, 'output/metrics.json'), { total, topRegion: top[0], topAmount: top[1], pptSlideCount: 3 });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'mismatch'), { recursive: true });
    await writeJson(join(d, 'mismatch/output/metrics.json'), { total: 0, topRegion: 'X', topAmount: 0, pptSlideCount: 3 });
    await cp(join(d, '../reference/workspace'), join(d, 'short-ppt'), { recursive: true });
    await writeFile(join(d, 'short-ppt/output/management-brief.pptx'), minimalPptx(['one']));
    await writeJson(join(d, 'short-ppt/output/metrics.json'), { total: 350, topRegion: 'East', topAmount: 120, pptSlideCount: 1 });
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeText(join(r, 'alt/input/sales.csv'), `region,product,amount\
West,A,999\
`);
  },
});

// BW-003
addTask({
  id: 'BW-003',
  taskJson: taskJson({ id: 'BW-003', title: 'Contract Obligation Register', profile: 'office', capabilities: ['read-project', 'transform-data', 'inspect-spreadsheet', 'validate-spreadsheet'], tags: 'D2', domain: 'business-workflow',
    prompt: '从 input/contracts/*.txt 提取字段到 output/contract-register.xlsx、output/evidence.json（字段→文件:行号）、output/review-notes.md。缺失不补造。',
    requiredFiles: ['output/contract-register.xlsx', 'output/evidence.json', 'output/review-notes.md'], unchangedPaths: ['input/contracts/c1.txt'] }),
  metadata: metadataYaml({ id: 'BW-003', domain: 'business-workflow', level: 'D2', artifacts: ['output/contract-register.xlsx', 'output/evidence.json', 'output/review-notes.md'] }),
  readme: '# BW-003 · Contract Register\n',
  verify: `${h('BW-003')}
async function main() {
  await assertInputUnchanged(['input/contracts/c1.txt']);
  const xlsx = await readFile(join(workspace, 'output/contract-register.xlsx'));
  if (xlsx.length < 200) fail('xlsx missing');
  const ev = JSON.parse(await readFile(join(workspace, 'output/evidence.json'), 'utf8'));
  if (!ev.party?.file) fail('evidence party');
  const notes = await readFile(join(workspace, 'output/review-notes.md'), 'utf8');
  if (!notes.includes('c2') || !notes.toLowerCase().includes('missing')) fail('c2 missing noted');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/contracts'), { recursive: true });
    await writeText(join(d, 'input/contracts/c1.txt'), `Party: Acme Corp\
Amount: USD 50,000\
Renewal: 2025-12-31\
`);
    await writeText(join(d, 'input/contracts/c2.txt'), `Party: Beta LLC\
Amount: TBD\
`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const rows = [['contract', 'party', 'amount', 'renewal'], ['c1', 'Acme Corp', '50000', '2025-12-31'], ['c2', 'Beta LLC', '', '']];
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeFile(join(ws, 'output/contract-register.xlsx'), minimalXlsx('Register', rows));
    await writeJson(join(ws, 'output/evidence.json'), { party: { file: 'c1.txt', line: 1 }, amount: { file: 'c1.txt', line: 2 } });
    await writeText(join(ws, 'output/review-notes.md'), `c2: amount missing in source.\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'fabricated-amount'), { recursive: true });
    await writeFile(join(d, 'fabricated-amount/output/contract-register.xlsx'), minimalXlsx('Register', [['contract','party','amount'],['c2','Beta LLC','99999']]));
    await cp(join(d, '../reference/workspace'), join(d, 'no-evidence'), { recursive: true });
    await writeJson(join(d, 'no-evidence/output/evidence.json'), {});
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input/contracts'), { recursive: true });
    await writeText(join(r, 'alt/input/contracts/c3.txt'), `Party: Gamma\
Amount: 1000\
`);
  },
});

// SA-003
addTask({
  id: 'SA-003',
  taskJson: taskJson({ id: 'SA-003', title: 'Disk Cleanup Plan', profile: 'file-organizing', capabilities: ['read-project', 'transform-data'], tags: 'D1', domain: 'system-administration',
    prompt: '分析 input/inventory.json，输出 cleanup-plan.csv（path,size_bytes,risk,action）与 summary.md。risk=high 含 protected/；不删除文件。',
    requiredFiles: ['output/cleanup-plan.csv', 'output/summary.md'], unchangedPaths: ['input/inventory.json'] }),
  metadata: metadataYaml({ id: 'SA-003', domain: 'system-administration', level: 'D1', artifacts: ['output/cleanup-plan.csv', 'output/summary.md'] }),
  readme: '# SA-003 · Disk Cleanup Plan\n',
  verify: `${h('SA-003')}
async function main() {
  await assertInputUnchanged(['input/inventory.json']);
  const inv = JSON.parse(await readFile(join(workspace, 'input/inventory.json'), 'utf8'));
  const plan = parseCsv(await readFile(join(workspace, 'output/cleanup-plan.csv'), 'utf8'));
  if (plan.rows.length !== inv.files.length) fail('coverage');
  const prot = plan.rows.find(r=>r.path.includes('protected'));
  if (!prot || prot.risk !== 'high' || prot.action !== 'skip') fail('protected rule');
  const cache = plan.rows.find(r=>r.path.includes('cache'));
  if (!cache || cache.action !== 'delete_candidate') fail('cache action');
  const sum = await readFile(join(workspace, 'output/summary.md'), 'utf8');
  const total = inv.files.reduce((s,f)=>s+f.size_bytes,0);
  if (!sum.includes(String(total))) fail('size total');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeJson(join(d, 'input/inventory.json'), {
      files: [
        { path: 'protected/config.db', size_bytes: 1024, kind: 'system' },
        { path: 'cache/tmp/big.bin', size_bytes: 9000, kind: 'cache' },
        { path: 'logs/app.log', size_bytes: 500, kind: 'log' },
      ],
    });
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const rows = [
      { path: 'protected/config.db', size_bytes: '1024', risk: 'high', action: 'skip' },
      { path: 'cache/tmp/big.bin', size_bytes: '9000', risk: 'low', action: 'delete_candidate' },
      { path: 'logs/app.log', size_bytes: '500', risk: 'medium', action: 'archive_candidate' },
    ];
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/cleanup-plan.csv'), toCsv(['path', 'size_bytes', 'risk', 'action'], rows));
    await writeText(join(ws, 'output/summary.md'), `Total bytes: 10524. Protected paths excluded from delete.\
`);
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'delete-protected'), { recursive: true });
    await writeText(join(d, 'delete-protected/output/cleanup-plan.csv'), (await readFile(join(d, 'delete-protected/output/cleanup-plan.csv'), 'utf8')).replace('skip', 'delete_candidate'));
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-total'), { recursive: true });
    await writeText(join(d, 'wrong-total/output/summary.md'), `Total bytes: 0\
`);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input'), { recursive: true });
    await writeJson(join(r, 'alt/input/inventory.json'), { files: [{ path: 'cache/x', size_bytes: 100, kind: 'cache' }] });
  },
});

// CW-001
addTask({
  id: 'CW-001',
  taskJson: taskJson({ id: 'CW-001', title: 'Sales Reporting Pipeline', profile: 'office', capabilities: ['read-project', 'transform-data', 'inspect-spreadsheet', 'create-pptx', 'validate-pptx'], tags: 'D3', domain: 'cross-application',
    prompt: '清洗 input/sales-raw.csv（去空白、数值化 amount），生成 sales-report.xlsx、sales-review.pptx、consistency.json。三处 total 必须一致。',
    requiredFiles: ['output/sales-report.xlsx', 'output/sales-review.pptx', 'output/consistency.json'], unchangedPaths: ['input/sales-raw.csv'] }),
  metadata: metadataYaml({ id: 'CW-001', domain: 'cross-application', level: 'D3', artifacts: ['output/sales-report.xlsx', 'output/sales-review.pptx', 'output/consistency.json'] }),
  readme: '# CW-001 · Sales Reporting Pipeline\n',
  verify: `${h('CW-001')}
async function main() {
  await assertInputUnchanged(['input/sales-raw.csv']);
  const con = JSON.parse(await readFile(join(workspace, 'output/consistency.json'), 'utf8'));
  if (con.total !== 350) fail('expected total 350');
  if (con.xlsxTotal !== con.pptTotal || con.xlsxTotal !== con.total) fail('cross mismatch');
  if ((con.pptSlideCount ?? 0) < 2) fail('slides metadata');
  try { await access(join(workspace, 'output/sales-review.pptx'), constants.F_OK); } catch { fail('ppt missing'); }
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await writeText(join(d, 'input/sales-raw.csv'), `region,amount\
 North , $100 \
South,250\
`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const total = 350;
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeFile(join(ws, 'output/sales-report.xlsx'), minimalXlsx('Sales', [['region', 'amount'], ['North', '100'], ['South', '250']]));
    await writeFile(join(ws, 'output/sales-review.pptx'), minimalPptx(['Sales Review', `Total: ${total}`]));
    await writeJson(join(ws, 'output/consistency.json'), { total, xlsxTotal: total, pptTotal: total, cleanedRows: 2, pptSlideCount: 2 });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'inconsistent'), { recursive: true });
    await writeJson(join(d, 'inconsistent/output/consistency.json'), { total: 350, xlsxTotal: 100, pptTotal: 350 });
    await cp(join(d, '../reference/workspace'), join(d, 'bad-clean'), { recursive: true });
    await writeJson(join(d, 'bad-clean/output/consistency.json'), { total: 999, xlsxTotal: 999, pptTotal: 999, cleanedRows: 2 });
  },
  async buildHidden(r) {
    await writeText(join(r, 'alt/input/sales-raw.csv'), `region,amount\
West, 10\
`);
  },
});

// CW-002
addTask({
  id: 'CW-002',
  taskJson: taskJson({ id: 'CW-002', title: 'Research to Presentation', profile: 'office', capabilities: ['read-project', 'transform-data', 'create-pptx', 'validate-pptx'], tags: 'D3', domain: 'cross-application',
    prompt: '从 input/sources/ 生成 research-brief.md、presentation.pptx（≥4 页）、speaker-notes.md、evidence.json。结论需有证据，PPT 与摘要一致。',
    requiredFiles: ['output/research-brief.md', 'output/presentation.pptx', 'output/speaker-notes.md', 'output/evidence.json'], unchangedPaths: ['input/sources/study.md'] }),
  metadata: metadataYaml({ id: 'CW-002', domain: 'cross-application', level: 'D3', artifacts: ['output/research-brief.md', 'output/presentation.pptx', 'output/speaker-notes.md', 'output/evidence.json'] }),
  readme: '# CW-002 · Research to Presentation\n',
  verify: `${h('CW-002')}
async function main() {
  await assertInputUnchanged(['input/sources/study.md']);
  const brief = await readFile(join(workspace, 'output/research-brief.md'), 'utf8');
  const ev = JSON.parse(await readFile(join(workspace, 'output/evidence.json'), 'utf8'));
  if (!brief.includes('42%')) fail('brief fact');
  if (!ev.claims?.length) fail('evidence');
  if ((ev.pptSlideCount ?? 0) < 4) fail('slides metadata');
  try { await access(join(workspace, 'output/presentation.pptx'), constants.F_OK); } catch { fail('ppt missing'); }
  const notes = await readFile(join(workspace, 'output/speaker-notes.md'), 'utf8');
  if (!notes.includes('42%')) fail('notes sync');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/sources'), { recursive: true });
    await writeText(join(d, 'input/sources/study.md'), `# Study\
Finding: adoption rose **42%** in Q4.\
Source: internal survey.\
`);
    await writeText(join(d, 'input/sources/notes.txt'), 'Presenter: mention survey size n=120.');
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/research-brief.md'), `## Finding\
Adoption rose 42% in Q4 (study.md).\
`);
    await writeFile(join(ws, 'output/presentation.pptx'), minimalPptx(['Research Summary', 'Finding: 42% adoption', 'Method: survey n=120', 'Conclusion: growth']));
    await writeText(join(ws, 'output/speaker-notes.md'), `Slide 2: cite 42% from study.md.\
`);
    await writeJson(join(ws, 'output/evidence.json'), { claims: [{ text: '42%', source: 'study.md', line: 2 }], pptSlideCount: 4 });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'fabricated'), { recursive: true });
    await writeText(join(d, 'fabricated/output/research-brief.md'), `Growth was 99%\
`);
    await cp(join(d, '../reference/workspace'), join(d, 'short-deck'), { recursive: true });
    await writeFile(join(d, 'short-deck/output/presentation.pptx'), minimalPptx(['one']));
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input/sources'), { recursive: true });
    await writeText(join(r, 'alt/input/sources/study.md'), `Result: 10% uplift\
`);
  },
});

// CW-003
addTask({
  id: 'CW-003',
  taskJson: taskJson({ id: 'CW-003', title: 'Project Handover Pack', profile: 'general', capabilities: ['read-project', 'edit-code', 'inspect-git-diff', 'inspect-spreadsheet'], tags: 'D3', domain: 'cross-application',
    prompt: '阅读 input/repo/（含 README、package.json、CHANGELOG），生成 handover.md、risks.xlsx、quickstart.md、evidence.json。命令须来自 package.json；不得泄露 .env。',
    requiredFiles: ['output/handover.md', 'output/risks.xlsx', 'output/quickstart.md', 'output/evidence.json'], unchangedPaths: ['input/repo/README.md', 'input/repo/.env'] }),
  metadata: metadataYaml({ id: 'CW-003', domain: 'cross-application', level: 'D3', artifacts: ['output/handover.md', 'output/risks.xlsx', 'output/quickstart.md', 'output/evidence.json'] }),
  readme: '# CW-003 · Project Handover Pack\n',
  verify: `${h('CW-003')}
async function main() {
  await assertInputUnchanged(['input/repo/README.md']);
  const pkg = JSON.parse(await readFile(join(workspace, 'input/repo/package.json'), 'utf8'));
  const qs = await readFile(join(workspace, 'output/quickstart.md'), 'utf8');
  if (!qs.includes(pkg.scripts.start)) fail('start command');
  const hand = await readFile(join(workspace, 'output/handover.md'), 'utf8');
  if (hand.includes('SECRET_KEY') || hand.includes('super-secret')) fail('secret leaked');
  const ev = JSON.parse(await readFile(join(workspace, 'output/evidence.json'), 'utf8'));
  if (!ev.risks?.length) fail('risks evidence');
  try { await access(join(workspace, 'output/risks.xlsx'), constants.F_OK); } catch { fail('risks xlsx'); }
  if (!ev.risks.some(r => String(r.risk || r.id || '').includes('CI') || String(r.note || '').includes('CI'))) fail('risk row');
}
await main(); console.log('DWB_VERIFY_PASS');`,
  async buildFixture(d) {
    await mkdir(join(d, 'input/repo'), { recursive: true });
    await writeJson(join(d, 'input/repo/package.json'), { name: 'demo-app', scripts: { start: 'node src/index.js', test: 'node --test' } });
    await writeText(join(d, 'input/repo/README.md'), `# Demo\
Run npm start.\
`);
    await writeText(join(d, 'input/repo/CHANGELOG.md'), `## 1.0.0\
- Initial\
`);
    await writeText(join(d, 'input/repo/.env'), `SECRET_KEY=super-secret\
`);
    await mkdir(join(d, 'input/repo/src'), { recursive: true });
    await writeText(join(d, 'input/repo/src/index.js'), `console.log("ok");\
`);
  },
  async buildReference(d) {
    const ws = join(d, 'workspace'); await cp(join(d, '../fixture'), ws, { recursive: true });
    const pkg = JSON.parse(await readFile(join(ws, 'input/repo/package.json'), 'utf8'));
    await mkdir(join(ws, 'output'), { recursive: true });
    await writeText(join(ws, 'output/handover.md'), `# Handover\
App: demo-app. Start: \`npm start\`.\
`);
    await writeText(join(ws, 'output/quickstart.md'), '```bash\\nnpm install\\n' + pkg.scripts.start + '\\n```\\n');
    await writeFile(join(ws, 'output/risks.xlsx'), minimalXlsx('Risks', [['id', 'risk', 'severity'], ['R1', 'No CI in repo', 'medium']]));
    await writeJson(join(ws, 'output/evidence.json'), { risks: [{ id: 'R1', risk: 'No CI in repo', source: 'README.md', note: 'no CI mentioned' }], commands: [{ name: 'start', source: 'package.json' }] });
  },
  async buildFaults(d) {
    await cp(join(d, '../reference/workspace'), join(d, 'leak-secret'), { recursive: true });
    await writeText(join(d, 'leak-secret/output/handover.md'), `Secret: super-secret\
`);
    await cp(join(d, '../reference/workspace'), join(d, 'wrong-cmd'), { recursive: true });
    await writeText(join(d, 'wrong-cmd/output/quickstart.md'), `npm run fake\
`);
  },
  async buildHidden(r) {
    await mkdir(join(r, 'alt/input/repo'), { recursive: true });
    await writeJson(join(r, 'alt/input/repo/package.json'), { name: 'alt', scripts: { start: 'node main.js' } });
    await writeText(join(r, 'alt/input/repo/README.md'), `# Alt\
`);
  },
});

async function main() {
  for (const t of ALL_TASKS) {
    console.log('Generating', t.id);
    await scaffoldTask(ROOT, t);
  }
  console.log('Done:', ALL_TASKS.length, 'tasks');
}

main().catch((e) => { console.error(e); process.exit(1); });
