/**
 * Bundled 运行时生命周期管理：安装、env 注入、全局实例。
 */
import { app } from "electron";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import {
  getAppRuntimePaths,
  type AppRuntimePaths,
} from "@desktop-agent/shared/runtime";
import {
  ensureBinariesInstalled,
  getDevResourcePaths,
  getInstalledPath,
  getPackagedResourcePaths,
  type BinaryInstallRecord,
} from "./install.js";
import { ensurePythonRuntime } from "./python.js";

export type { BinaryInstallRecord } from "./install.js";

/** bundled runtime 当前可用性、路径和最近初始化失败信息。 */
export interface BinaryManagerStatus {
  ready: boolean;
  paths: AppRuntimePaths;
  installed?: BinaryInstallRecord;
  error?: string;
}

/**
 * 管理 Electron 主进程使用的 bundled runtime 生命周期。
 *
 * 它集中安装状态和路径来源，避免 IPC/Agent 各自探测而得到不一致的可用性结论。
 */
export class BinaryManager {
  private paths: AppRuntimePaths;
  private status: BinaryManagerStatus;

  /** 使用指定 home 隔离运行时路径，测试可避免写入真实用户目录。 */
  constructor(homeDir: string = homedir()) {
    this.paths = getAppRuntimePaths(homeDir);
    this.status = { ready: false, paths: this.paths };
  }

  /** 返回统一计算的运行时、缓存和工具 store 路径。 */
  getPaths(): AppRuntimePaths {
    return this.paths;
  }

  /** 返回最后一次初始化后的状态快照。 */
  getStatus(): BinaryManagerStatus {
    return this.status;
  }

  /** 根据打包状态选择资源清单位置，避免开发与生产硬编码同一路径。 */
  private getResourcePaths(): { manifestPath: string; archivesDir: string } {
    if (app.isPackaged) {
      return getPackagedResourcePaths(process.resourcesPath);
    }
    return getDevResourcePaths(__dirname);
  }

  /**
   * 检查或安装 bundled runtime，并把任何失败固化为可供 IPC 展示的状态。
   *
   * 非 Windows 不安装这些 Windows 归档，但仍标记可用，交由平台自己的系统运行时处理。
   */
  async ensureInstalled(options?: { checkOnly?: boolean }): Promise<void> {
    if (process.platform !== "win32") {
      this.status = {
        ready: true,
        paths: this.paths,
        error: "非 Windows 平台跳过 bundled 运行时安装",
      };
      return;
    }

    const { manifestPath, archivesDir } = this.getResourcePaths();
    if (!existsSync(manifestPath)) {
      const error = `找不到运行时 manifest: ${manifestPath}`;
      this.status = { ready: false, paths: this.paths, error };
      throw new Error(error);
    }

    try {
      const result = await ensureBinariesInstalled({
        homeDir: homedir(),
        manifestPath,
        archivesDir,
        checkOnly: options?.checkOnly,
        onProgress: (event) => {
          if (event.message) {
            console.info(`[runtime] ${event.message}`);
          }
        },
      });

      if (options?.checkOnly && !result.installed) {
        const error = `运行时未安装，缺少: ${result.missing?.join(", ") ?? "unknown"}。请运行 pnpm setup:binaries`;
        this.status = { ready: false, paths: this.paths, error };
        throw new Error(error);
      }

      let installed: BinaryInstallRecord | undefined;
      const installedPath = getInstalledPath(homedir());
      if (existsSync(installedPath)) {
        installed = JSON.parse(
          readFileSync(installedPath, "utf-8"),
        ) as BinaryInstallRecord;
      } else if (result.record) {
        installed = result.record;
      }

      this.status = {
        ready: true,
        paths: this.paths,
        installed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = { ready: false, paths: this.paths, error: message };
      throw error;
    }
  }

  /**
   * 初始化工具 store 目录与 Python runtime。
   *
   * bundled 环境变量仅在创建 Agent 子进程时注入，不改写全局 `process.env`，避免污染 Electron 自身与其他插件。
   */
  applyBaseEnv(): void {
    this.ensureStoreDirectories();
    try {
      ensurePythonRuntime(this.paths, (message) =>
        console.info(`[runtime] ${message}`),
      );
    } catch (error) {
      console.warn(
        "[runtime] Python 初始化失败:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /** 确保 npm、uv、pip 的每个私有缓存目录存在，再允许工具运行。 */
  private ensureStoreDirectories(): void {
    const dirs = [
      this.paths.store.npmPrefix,
      this.paths.store.npmCache,
      this.paths.store.npxHome,
      this.paths.store.uvCache,
      this.paths.store.uvTools,
      this.paths.store.uvPython,
      this.paths.store.pipCache,
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }
}

let binaryManager: BinaryManager | null = null;

/** 在应用启动时注册唯一 BinaryManager 实例。 */
export function setBinaryManager(manager: BinaryManager): void {
  binaryManager = manager;
}

/** 获取已注册实例；启动前调用者必须能处理 null。 */
export function getBinaryManager(): BinaryManager | null {
  return binaryManager;
}

/** 获取已注册路径，启动早期退回默认路径以保持纯路径计算可用。 */
export function getBinaryManagerPaths(): AppRuntimePaths {
  return binaryManager?.getPaths() ?? getAppRuntimePaths();
}

/** 判断 bundled runtime 是否通过最近一次初始化。 */
export function isRuntimeReady(): boolean {
  return binaryManager?.getStatus().ready ?? false;
}

/** 返回最近 runtime 初始化错误，供受依赖功能给出可操作提示。 */
export function getRuntimeInitError(): string | undefined {
  return binaryManager?.getStatus().error;
}
