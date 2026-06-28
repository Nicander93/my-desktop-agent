/**
 * 工作区文件模糊搜索，支持 gitignore 与常见忽略目录
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import ignore from 'ignore';
import type { FileSearchResult } from '@desktop-agent/shared';

const MAX_RESULTS = 30;
const MAX_DEPTH = 20;

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  '__pycache__/',
  '.codegraph/',
  '.understand-anything/',
];

const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.codegraph', '.understand-anything',
]);

interface IgnoreState {
  patterns: string[];
}

function posixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function readGitignorePatterns(gitignorePath: string, rootPath: string): string[] {
  if (!existsSync(gitignorePath)) return [];

  const content = readFileSync(gitignorePath, 'utf-8');
  const baseDir = posixPath(relative(rootPath, join(gitignorePath, '..')) || '.');
  const prefix = baseDir === '.' ? '' : `${baseDir}/`;

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      if (line.startsWith('!')) {
        const negated = line.slice(1);
        if (negated.startsWith('/')) return `!${prefix}${negated.slice(1)}`;
        return `!${prefix}${negated}`;
      }
      if (line.startsWith('/')) return `${prefix}${line.slice(1)}`;
      return `${prefix}${line}`;
    });
}

function initialIgnoreState(rootPath: string): IgnoreState {
  const patterns = [...DEFAULT_IGNORE_PATTERNS];
  patterns.push(...readGitignorePatterns(join(rootPath, '.gitignore'), rootPath));
  return { patterns };
}

function childIgnoreState(parent: IgnoreState, rootPath: string, dirRel: string): IgnoreState {
  const gi = join(rootPath, dirRel.replace(/\//g, sep), '.gitignore');
  if (!existsSync(gi)) return parent;
  return { patterns: [...parent.patterns, ...readGitignorePatterns(gi, rootPath)] };
}

function buildIgnore(state: IgnoreState) {
  return ignore().add(state.patterns);
}

function isIgnored(ig: ReturnType<typeof buildIgnore>, relPath: string, isDirectory: boolean): boolean {
  if (ig.ignores(relPath)) return true;
  if (isDirectory && ig.ignores(`${relPath}/`)) return true;
  return false;
}

function matchesQuery(name: string, relPath: string, queryLower: string): boolean {
  if (!queryLower) return true;
  const nameLower = name.toLowerCase();
  const pathLower = relPath.toLowerCase();
  return nameLower.includes(queryLower) || pathLower.includes(queryLower);
}

function sortResults(results: FileSearchResult[], queryLower: string): void {
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    if (queryLower) {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aPath = a.relativePath.toLowerCase();
      const bPath = b.relativePath.toLowerCase();
      const aStarts = aName.startsWith(queryLower) || aPath.startsWith(queryLower);
      const bStarts = bName.startsWith(queryLower) || bPath.startsWith(queryLower);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
    }

    return a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' });
  });
}

function listFirstLevel(rootPath: string, state: IgnoreState): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  const ig = buildIgnore(state);
  const entries = readdirSync(rootPath, { withFileTypes: true })
    .filter((e) => e.name !== '.' && e.name !== '..');

  const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of [...dirs, ...files]) {
    const childRel = entry.name;
    const fullPath = join(rootPath, entry.name);
    if (isIgnored(ig, childRel, entry.isDirectory())) continue;
    if (entry.isDirectory() && SKIP_DIR_NAMES.has(entry.name)) continue;

    results.push({
      name: entry.name,
      path: fullPath,
      relativePath: childRel,
      isDirectory: entry.isDirectory(),
    });
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

export function searchFiles(rootPath: string, query: string): FileSearchResult[] {
  const queryLower = query.trim().toLowerCase();
  const ignoreState = initialIgnoreState(rootPath);
  const results: FileSearchResult[] = [];

  function walk(dirPath: string, dirRel: string, state: IgnoreState, depth: number): void {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

    const ig = buildIgnore(state);
    const entries = readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.name !== '.' && e.name !== '..');

    const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of [...dirs, ...files]) {
      const childRel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      const fullPath = join(dirPath, entry.name);

      if (isIgnored(ig, childRel, entry.isDirectory())) continue;
      if (entry.isDirectory() && SKIP_DIR_NAMES.has(entry.name)) continue;

      if (matchesQuery(entry.name, childRel, queryLower)) {
        results.push({
          name: entry.name,
          path: fullPath,
          relativePath: childRel,
          isDirectory: entry.isDirectory(),
        });
        if (results.length >= MAX_RESULTS) return;
      }

      if (entry.isDirectory()) {
        const childState = childIgnoreState(state, rootPath, childRel);
        walk(fullPath, childRel, childState, depth + 1);
      }
    }
  }

  if (!queryLower) {
    const firstLevel = listFirstLevel(rootPath, ignoreState);
    sortResults(firstLevel, queryLower);
    return firstLevel;
  }

  walk(rootPath, '', ignoreState, 0);
  sortResults(results, queryLower);
  return results;
}
