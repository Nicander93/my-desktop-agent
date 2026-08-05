/**
 * Python Runtime 发现与版本解析的共享帮助函数。
 *
 * 本文件只解析本地环境和 bundled 路径，不负责下载或修改 Python 安装；Host 决定实际子进程使用策略。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DEFAULT_PYTHON_VERSION = "3.12";

/**
 * 已安装 Python 解释器与跨 shell shim 目录的持久化记录。
 */
export interface PythonRuntimeRecord {
  version: string;
  pythonExe: string;
  shimsDir: string;
}

/**
 * 返回 store 根下 Python 安装记录 JSON 的标准路径。
 */
export function getPythonRuntimeRecordPath(storeRoot: string): string {
  return join(storeRoot, "python", "runtime.json");
}

/**
 * 返回 Host 写入 python/python3 命令 shim 的标准目录。
 */
export function getPythonShimsDir(storeRoot: string): string {
  return join(storeRoot, "shims");
}

/**
 * 尽力读取有效运行时记录；解释器缺失、损坏 JSON 或缺失文件均返回空值。
 */
export function readPythonRuntimeRecord(
  storeRoot: string,
): PythonRuntimeRecord | undefined {
  const recordPath = getPythonRuntimeRecordPath(storeRoot);
  if (!existsSync(recordPath)) return undefined;

  try {
    const record = JSON.parse(
      readFileSync(recordPath, "utf-8"),
    ) as PythonRuntimeRecord;
    if (!record.pythonExe || !existsSync(record.pythonExe)) return undefined;
    return record;
  } catch {
    return undefined;
  }
}

/**
 * 返回应优先加入 PATH 的 shim 与解释器目录，并保持去重顺序。
 */
export function getPythonPathSegments(storeRoot: string): string[] {
  const record = readPythonRuntimeRecord(storeRoot);
  if (!record) return [];

  const segments = [record.shimsDir, dirname(record.pythonExe)];
  return [...new Set(segments)];
}
