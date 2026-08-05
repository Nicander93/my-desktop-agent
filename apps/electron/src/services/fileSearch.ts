/**
 * 工作区文件模糊搜索，支持 gitignore 与常见忽略目录
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, relative, sep } from "path";
import ignore from "ignore";
import type { FileSearchResult } from "@desktop-agent/shared";

/** 搜索响应最大条数，保护主进程和 renderer 菜单的交互延迟。 */
const MAX_RESULTS = 30;
/** 递归扫描上限，避免异常目录树造成无界同步 I/O。 */
const MAX_DEPTH = 20;

/** 即使项目没有 .gitignore 也必须排除的依赖、构建产物和分析缓存。 */
const DEFAULT_IGNORE_PATTERNS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "__pycache__/",
  ".codegraph/",
  ".understand-anything/",
];

/** 目录名级快速剪枝，用于在 ignore 规则计算前避免进入确定无价值的大目录。 */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".codegraph",
  ".understand-anything",
]);

/** 从根到当前目录累积的 gitignore 模式。 */
interface IgnoreState {
  patterns: string[];
}

/** 将平台路径转为 gitignore 使用的 POSIX 分隔符。 */
function posixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** 读取一个 .gitignore，并将相对模式提升为相对工作区根目录的模式。 */
function readGitignorePatterns(
  gitignorePath: string,
  rootPath: string,
): string[] {
  if (!existsSync(gitignorePath)) return [];

  const content = readFileSync(gitignorePath, "utf-8");
  const baseDir = posixPath(
    relative(rootPath, join(gitignorePath, "..")) || ".",
  );
  const prefix = baseDir === "." ? "" : `${baseDir}/`;

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      if (line.startsWith("!")) {
        const negated = line.slice(1);
        if (negated.startsWith("/")) return `!${prefix}${negated.slice(1)}`;
        return `!${prefix}${negated}`;
      }
      if (line.startsWith("/")) return `${prefix}${line.slice(1)}`;
      return `${prefix}${line}`;
    });
}

/** 构造根目录 ignore 状态，内置排除规则始终优先参与。 */
function initialIgnoreState(rootPath: string): IgnoreState {
  const patterns = [...DEFAULT_IGNORE_PATTERNS];
  patterns.push(
    ...readGitignorePatterns(join(rootPath, ".gitignore"), rootPath),
  );
  return { patterns };
}

/** 进入子目录时合并其 .gitignore，不能改变同级目录的规则视图。 */
function childIgnoreState(
  parent: IgnoreState,
  rootPath: string,
  dirRel: string,
): IgnoreState {
  const gi = join(rootPath, dirRel.replace(/\//g, sep), ".gitignore");
  if (!existsSync(gi)) return parent;
  return {
    patterns: [...parent.patterns, ...readGitignorePatterns(gi, rootPath)],
  };
}

/** 根据当前累积规则创建 ignore 匹配器；避免在不同目录间共享可变实例。 */
function buildIgnore(state: IgnoreState) {
  return ignore().add(state.patterns);
}

/** 同时检查文件和目录形式的模式，使 `foo/` 正确排除整棵子树。 */
function isIgnored(
  ig: ReturnType<typeof buildIgnore>,
  relPath: string,
  isDirectory: boolean,
): boolean {
  if (ig.ignores(relPath)) return true;
  if (isDirectory && ig.ignores(`${relPath}/`)) return true;
  return false;
}

/** 在文件名或相对路径中执行大小写无关的子串匹配。 */
function matchesQuery(
  name: string,
  relPath: string,
  queryLower: string,
): boolean {
  if (!queryLower) return true;
  const nameLower = name.toLowerCase();
  const pathLower = relPath.toLowerCase();
  return nameLower.includes(queryLower) || pathLower.includes(queryLower);
}

/** 以目录优先、前缀匹配优先、路径稳定排序呈现搜索结果。 */
function sortResults(results: FileSearchResult[], queryLower: string): void {
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    if (queryLower) {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aPath = a.relativePath.toLowerCase();
      const bPath = b.relativePath.toLowerCase();
      const aStarts =
        aName.startsWith(queryLower) || aPath.startsWith(queryLower);
      const bStarts =
        bName.startsWith(queryLower) || bPath.startsWith(queryLower);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
    }

    return a.relativePath.localeCompare(b.relativePath, undefined, {
      sensitivity: "base",
    });
  });
}

/** 空查询仅列出工作区首层，避免打开选择器时执行完整递归扫描。 */
function listFirstLevel(
  rootPath: string,
  state: IgnoreState,
): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  const ig = buildIgnore(state);
  const entries = readdirSync(rootPath, { withFileTypes: true }).filter(
    (e) => e.name !== "." && e.name !== "..",
  );

  const dirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((e) => e.isFile())
    .sort((a, b) => a.name.localeCompare(b.name));

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

/**
 * 在工作区内同步搜索文件与目录。
 *
 * 搜索严格从已授权的 rootPath 开始，并受 ignore、深度和条数上限约束，不能作为任意文件系统枚举接口使用。
 */
export function searchFiles(
  rootPath: string,
  query: string,
): FileSearchResult[] {
  const queryLower = query.trim().toLowerCase();
  const ignoreState = initialIgnoreState(rootPath);
  const results: FileSearchResult[] = [];

  /** 递归遍历当前目录，在达到资源上限时立即停止后续 I/O。 */
  function walk(
    dirPath: string,
    dirRel: string,
    state: IgnoreState,
    depth: number,
  ): void {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

    const ig = buildIgnore(state);
    const entries = readdirSync(dirPath, { withFileTypes: true }).filter(
      (e) => e.name !== "." && e.name !== "..",
    );

    const dirs = entries
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = entries
      .filter((e) => e.isFile())
      .sort((a, b) => a.name.localeCompare(b.name));

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

  walk(rootPath, "", ignoreState, 0);
  sortResults(results, queryLower);
  return results;
}
