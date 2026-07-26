import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function writeJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(obj, null, 2) + '\n');
}

export async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text.endsWith('\n') ? text : text + '\n');
}

export async function copyTree(src, dest) {
  await cp(src, dest, { recursive: true, force: true });
}

export function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

export function splitCsvLine(line) {
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

export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n') + '\n';
}

export async function walkFiles(dir, base = dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkFiles(p, base));
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out;
}

export async function hashFile(path) {
  return sha256(await readFile(path));
}

export function harnessHeader(taskId) {
  return `#!/usr/bin/env node
/** ${taskId} harness — deterministic checks; prints DWB_VERIFY_PASS on success. */
import { readFile, access, readdir, copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = process.cwd();
const taskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(\`DWB_VERIFY_FAIL: \${message}\`);
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.replace(/\\r\\n/g, '\\n').trim().split('\\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
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

async function assertInputUnchanged(relPaths) {
  for (const rel of relPaths) {
    const base = await readFile(join(taskDir, 'fixture', rel));
    const cur = await readFile(join(workspace, rel));
    if (!base.equals(cur)) fail(\`protected input modified: \${rel}\`);
  }
}
`;
}

export function taskJson({ id, title, prompt, profile, capabilities, tags, requiredFiles, unchangedPaths, domain }) {
  return {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    title,
    prompt,
    profile,
    capabilities,
    workflowId: 'inspect-implement-run-verify',
    suite: 'quality',
    tags: ['dwb', domain, tags],
    fixture: 'fixture',
    limits: { maxTurns: 30, timeoutMs: 900000, maxChangedFiles: 30 },
    verifier: {
      requiredFiles,
      unchangedPaths,
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
}

export function metadataYaml({ id, domain, level, artifacts }) {
  return `benchmark: dwb
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
  - ${id}-D0
  - ${id}-D1A
  - ${id}-D1B
`;
}

export async function scaffoldTask(root, spec) {
  const taskRoot = join(root, 'benchmarks/tasks', spec.id);
  await mkdir(join(taskRoot, 'fixture'), { recursive: true });
  await mkdir(join(taskRoot, 'harness'), { recursive: true });
  await mkdir(join(taskRoot, 'reference'), { recursive: true });
  await mkdir(join(taskRoot, 'faults'), { recursive: true });
  await writeJson(join(taskRoot, 'task.json'), spec.taskJson);
  await writeText(join(taskRoot, 'metadata.yaml'), spec.metadata);
  await writeText(join(taskRoot, 'README.md'), spec.readme);
  await writeText(join(taskRoot, 'harness/verify.mjs'), spec.verify);
  await spec.buildFixture(join(taskRoot, 'fixture'));
  await spec.buildReference(join(taskRoot, 'reference'));
  await spec.buildFaults(join(taskRoot, 'faults'));
  await spec.buildHidden(join(root, 'benchmarks/hidden-fixtures', spec.id));
  return taskRoot;
}
