import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'apps/renderer/src');

const copies = [
  ['components/chat', 'features/chat'],
  ['components/workspace', 'features/workspace'],
  ['components/settings', 'features/settings'],
  ['components/tools', 'features/tools-panel'],
];

for (const [from, to] of copies) {
  const fromPath = join(srcRoot, from);
  const toPath = join(srcRoot, to);
  mkdirSync(dirname(toPath), { recursive: true });
  cpSync(fromPath, toPath, { recursive: true });
  rmSync(fromPath, { recursive: true, force: true });
  console.log(`copied ${from} -> ${to}`);
}

const replacements = [
  ["@/components/chat/", "@/features/chat/"],
  ["@/components/workspace/", "@/features/workspace/"],
  ["@/components/settings/", "@/features/settings/"],
  ["@/components/tools/", "@/features/tools-panel/"],
  ["from '../layout/", "from '@/components/layout/"],
  ['from "../layout/', 'from "@/components/layout/'],
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

for (const file of walk(srcRoot)) {
  let content = readFileSync(file, 'utf8');
  let updated = content;
  for (const [from, to] of replacements) {
    updated = updated.split(from).join(to);
  }
  if (updated !== content) {
    writeFileSync(file, updated, 'utf8');
    console.log(`updated ${file.replace(root + '\\', '').replace(root + '/', '')}`);
  }
}
