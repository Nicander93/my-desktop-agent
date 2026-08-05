/**
 * 用 bundled uv 安装 Python，并写入 python/python3 shim。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildAppLevelEnv,
  DEFAULT_PYTHON_VERSION,
  getPythonRuntimeRecordPath,
  getPythonShimsDir,
  resolveBundledCommand,
  type AppRuntimePaths,
  type PythonRuntimeRecord,
} from "@desktop-agent/shared/runtime";

const PYTHON_INSTALL_MIRRORS = [
  "https://ghproxy.net/https://github.com/astral-sh/python-build-standalone/releases/download",
  "https://mirror.ghproxy.com/https://github.com/astral-sh/python-build-standalone/releases/download",
  "https://ghfast.top/https://github.com/astral-sh/python-build-standalone/releases/download",
];

/**
 * 构造 uv 子进程的应用级环境，并可选地指定本次安装尝试使用的镜像。
 */
function buildPythonEnv(
  paths: AppRuntimePaths,
  mirror?: string,
): Record<string, string> {
  return {
    ...process.env,
    ...buildAppLevelEnv(paths),
    ...(mirror ? { UV_PYTHON_INSTALL_MIRROR: mirror } : {}),
  } as Record<string, string>;
}

/**
 * 为 Windows 命令行和 POSIX shell 写入统一的 python/python3 shim。
 *
 * shim 只转发参数到已解析的解释器路径，避免调用方依赖 uv 的安装目录。
 */
function writePythonShims(shimsDir: string, pythonExe: string): void {
  mkdirSync(shimsDir, { recursive: true });
  const escaped = pythonExe.replace(/"/g, '""');
  const bashPath = pythonExe.replace(/\\/g, "/");
  const shim = `@echo off\r\n"${escaped}" %*\r\n`;
  writeFileSync(`${shimsDir}/python3.cmd`, shim, "utf-8");
  writeFileSync(`${shimsDir}/python.cmd`, shim, "utf-8");
  const bashShim = `#!/usr/bin/env bash\nexec "${bashPath}" "$@"\n`;
  writeFileSync(`${shimsDir}/python3`, bashShim, "utf-8");
  writeFileSync(`${shimsDir}/python`, bashShim, "utf-8");
}

/**
 * 尽力读取此前安装的运行时记录；损坏或缺失记录会被视为未安装。
 */
function readRecord(recordPath: string): PythonRuntimeRecord | undefined {
  if (!existsSync(recordPath)) return undefined;
  try {
    return JSON.parse(readFileSync(recordPath, "utf-8")) as PythonRuntimeRecord;
  } catch {
    return undefined;
  }
}

/**
 * 确保 Windows 应用运行时存在目标 Python，并返回可供 Agent 使用的记录。
 *
 * 优先复用有效记录或 uv 已发现的解释器；安装时按镜像顺序回退，最后同步 shim 和记录文件。
 */
export function ensurePythonRuntime(
  paths: AppRuntimePaths,
  onProgress?: (message: string) => void,
): PythonRuntimeRecord | undefined {
  if (process.platform !== "win32") return undefined;

  const recordPath = getPythonRuntimeRecordPath(paths.store.root);
  const shimsDir = getPythonShimsDir(paths.store.root);
  const existing = readRecord(recordPath);
  if (
    existing?.version === DEFAULT_PYTHON_VERSION &&
    existsSync(existing.pythonExe)
  ) {
    writePythonShims(shimsDir, existing.pythonExe);
    return { ...existing, shimsDir };
  }

  const uv = resolveBundledCommand(paths, "uv");
  let env = buildPythonEnv(paths);

  const discovered = spawnSync(uv, ["python", "find"], {
    env,
    encoding: "utf-8",
  }).stdout.trim();
  if (!existing?.pythonExe && discovered && existsSync(discovered)) {
    writePythonShims(shimsDir, discovered);
    const record: PythonRuntimeRecord = {
      version: DEFAULT_PYTHON_VERSION,
      pythonExe: discovered,
      shimsDir,
    };
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf-8");
    return record;
  }

  onProgress?.(`安装 Python ${DEFAULT_PYTHON_VERSION}...`);
  let installed = false;
  for (const mirror of [...PYTHON_INSTALL_MIRRORS, undefined]) {
    env = buildPythonEnv(paths, mirror);
    const install = spawnSync(
      uv,
      ["python", "install", DEFAULT_PYTHON_VERSION],
      {
        env,
        encoding: "utf-8",
        timeout: 15 * 60 * 1000,
      },
    );
    if (install.status === 0) {
      installed = true;
      break;
    }
    if (mirror) {
      console.warn(
        `[runtime] uv python install 镜像失败 (${mirror}):`,
        install.stderr || install.stdout || install.error,
      );
    } else {
      console.warn(
        "[runtime] uv python install 失败:",
        install.stderr || install.stdout || install.error,
      );
    }
  }

  if (!installed) {
    const fallbackExe = spawnSync(uv, ["python", "find"], {
      env,
      encoding: "utf-8",
    }).stdout.trim();
    if (!fallbackExe || !existsSync(fallbackExe)) return undefined;
  }

  const find = spawnSync(uv, ["python", "find"], { env, encoding: "utf-8" });
  const pythonExe = find.stdout.trim();
  if (!pythonExe || !existsSync(pythonExe)) {
    console.warn("[runtime] uv python find 失败:", find.stderr || find.stdout);
    return undefined;
  }

  writePythonShims(shimsDir, pythonExe);
  const record: PythonRuntimeRecord = {
    version: DEFAULT_PYTHON_VERSION,
    pythonExe,
    shimsDir,
  };
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf-8");
  return record;
}
