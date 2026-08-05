/**
 * 工作区文件系统服务
 *
 * 统一处理 stat / read / write，所有操作经 pathGuard 校验
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
} from "fs";
import { extname, basename, dirname, join } from "path";
import type { BrowserWindow } from "electron";
import type {
  FileEntry,
  FileStat,
  ReadFileResult,
  FileSearchResult,
} from "@desktop-agent/shared";
import { checkPathAccess } from "./pathGuard";
import { searchFiles as searchWorkspaceFiles } from "./fileSearch";
import * as workspaceService from "./workspaceService";

/** 可安全按 UTF-8 读取和写入的文本扩展名白名单。 */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".txt",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  ".csv",
  ".sql",
  ".sh",
  ".bat",
  ".ps1",
  ".vue",
  ".svelte",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
]);

/** 可转为 base64 预览的图片扩展名与 MIME 映射。 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

/** 仅预览、不允许编辑的办公二进制类型与 MIME 映射。 */
const OFFICE_EXTENSIONS: Record<string, string> = {
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
};

/** 允许传回 renderer 的二进制类型；其他类型不能借文件浏览器读取。 */
const PREVIEWABLE_BINARY = { ...IMAGE_EXTENSIONS, ...OFFICE_EXTENSIONS };

/** 文本整文件读取上限，保护主进程内存与 IPC 消息大小。 */
const MAX_TEXT_SIZE = 5 * 1024 * 1024;
/** base64 预览读取上限，二进制编码会额外膨胀传输体积。 */
const MAX_BINARY_SIZE = 20 * 1024 * 1024;

/** 目录浏览中跳过的依赖和生成物目录，避免 renderer 误触大规模枚举。 */
const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".codegraph",
  ".understand-anything",
]);

/** 从路径提取小写扩展名，正确处理 `.gitignore` 等点文件。 */
function getExt(filePath: string): string {
  const name = basename(filePath);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    if (name.startsWith(".") && name.length > 1) return name.toLowerCase();
    return "";
  }
  return name.slice(dot).toLowerCase();
}

/** 判断扩展名是否允许走 UTF-8 文本读写路径。 */
function isTextFile(ext: string): boolean {
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (ext === "" && !extname(basename(""))) return false;
  return false;
}

/** 根据受支持类型生成响应 MIME；未知文件显式标记为二进制。 */
function getMimeType(ext: string): string {
  if (PREVIEWABLE_BINARY[ext]) return PREVIEWABLE_BINARY[ext];
  if (isTextFile(ext)) return "text/plain";
  return "application/octet-stream";
}

/**
 * 在任意文件系统操作前执行工作区路径授权。
 *
 * 该检查绑定 renderer 窗口，不能由调用方自行省略或以路径字符串替代用户确认。
 */
async function assertAccess(
  workspaceId: string,
  targetPath: string,
  window: BrowserWindow | null,
): Promise<void> {
  const result = await checkPathAccess(
    { workspaceId, targetPath, toolName: "user-fs" },
    window,
  );
  if (!result.allowed) {
    throw new Error("路径访问被拒绝");
  }
}

/** 在通过授权后读取文件元信息；不存在路径返回结构化状态而非异常。 */
export async function statFile(
  workspaceId: string,
  targetPath: string,
  window: BrowserWindow | null,
): Promise<FileStat> {
  await assertAccess(workspaceId, targetPath, window);

  if (!existsSync(targetPath)) {
    return {
      exists: false,
      isDirectory: false,
      isFile: false,
      size: 0,
      ext: getExt(targetPath),
    };
  }

  const info = statSync(targetPath);
  return {
    exists: true,
    isDirectory: info.isDirectory(),
    isFile: info.isFile(),
    size: info.size,
    ext: getExt(targetPath),
  };
}

/**
 * 读取工作区文件用于编辑或预览。
 *
 * 文本与允许预览的二进制分别受不同大小上限约束，未知类型绝不传回 renderer。
 */
export async function readFile(
  workspaceId: string,
  targetPath: string,
  window: BrowserWindow | null,
): Promise<ReadFileResult> {
  await assertAccess(workspaceId, targetPath, window);

  if (!existsSync(targetPath)) {
    throw new Error("文件不存在");
  }

  const info = statSync(targetPath);
  if (info.isDirectory()) {
    throw new Error("无法读取目录");
  }

  const ext = getExt(targetPath);
  const mimeType = getMimeType(ext);

  if (isTextFile(ext) || ext === "") {
    if (info.size > MAX_TEXT_SIZE) {
      throw new Error(
        `文件过大（${Math.round(info.size / 1024 / 1024)}MB），文本读取上限 5MB`,
      );
    }
    const content = readFileSync(targetPath, "utf-8");
    return { content, encoding: "utf8", mimeType, size: info.size };
  }

  if (PREVIEWABLE_BINARY[ext]) {
    if (info.size > MAX_BINARY_SIZE) {
      throw new Error(
        `文件过大（${Math.round(info.size / 1024 / 1024)}MB），预览上限 20MB`,
      );
    }
    const buffer = readFileSync(targetPath);
    return {
      content: buffer.toString("base64"),
      encoding: "base64",
      mimeType,
      size: info.size,
    };
  }

  throw new Error(`不支持预览此文件类型（${ext || "无扩展名"}）`);
}

/** 写入已授权路径，仅接受文本类型并禁止隐式创建父目录。 */
export async function writeFile(
  workspaceId: string,
  targetPath: string,
  content: string,
  window: BrowserWindow | null,
): Promise<void> {
  await assertAccess(workspaceId, targetPath, window);

  if (existsSync(targetPath)) {
    const info = statSync(targetPath);
    if (info.isDirectory()) {
      throw new Error("无法写入目录");
    }
  }

  const ext = getExt(targetPath);
  if (!isTextFile(ext) && ext !== "") {
    throw new Error(`不支持编辑此文件类型（${ext}）`);
  }

  const parent = dirname(targetPath);
  if (!existsSync(parent)) {
    throw new Error("父目录不存在");
  }

  writeFileSync(targetPath, content, "utf-8");
}

/** 列出已授权目录，跳过高噪声目录并以目录优先顺序返回。 */
export async function readDir(
  workspaceId: string,
  dirPath: string,
  window: BrowserWindow | null,
): Promise<FileEntry[]> {
  await assertAccess(workspaceId, dirPath, window);

  if (!existsSync(dirPath)) {
    throw new Error("目录不存在");
  }

  const info = statSync(dirPath);
  if (!info.isDirectory()) {
    throw new Error("不是目录");
  }

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORE_DIR_NAMES.has(entry.name)) continue;
    if (entry.name === "." || entry.name === "..") continue;

    const fullPath = join(dirPath, entry.name);
    let size: number | undefined;
    if (entry.isFile()) {
      size = statSync(fullPath).size;
    }

    result.push({
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      size,
    });
  }

  result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return result;
}

/** 从已存在的工作区根目录执行受授权保护的文件搜索。 */
export async function searchFiles(
  workspaceId: string,
  query: string,
  window: BrowserWindow | null,
): Promise<FileSearchResult[]> {
  const workspace = workspaceService.getWorkspace(workspaceId);
  if (!workspace) {
    throw new Error("工作区不存在");
  }

  await assertAccess(workspaceId, workspace.path, window);
  return searchWorkspaceFiles(workspace.path, query);
}

export { isTextFile, getExt, getMimeType };
