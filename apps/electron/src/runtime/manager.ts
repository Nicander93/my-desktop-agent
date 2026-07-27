/**
 * Bundled 运行时生命周期管理：安装、env 注入、全局实例。
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { getAppRuntimePaths, type AppRuntimePaths } from '@desktop-agent/shared/runtime';
import {
  ensureBinariesInstalled,
  getDevResourcePaths,
  getInstalledPath,
  getPackagedResourcePaths,
  type BinaryInstallRecord,
} from './install.js';
import { ensurePythonRuntime } from './python.js';

export type { BinaryInstallRecord } from './install.js';

export interface BinaryManagerStatus {
  ready: boolean;
  paths: AppRuntimePaths;
  installed?: BinaryInstallRecord;
  error?: string;
}

export class BinaryManager {
  private paths: AppRuntimePaths;
  private status: BinaryManagerStatus;

  constructor(homeDir: string = homedir()) {
    this.paths = getAppRuntimePaths(homeDir);
    this.status = { ready: false, paths: this.paths };
  }

  getPaths(): AppRuntimePaths {
    return this.paths;
  }

  getStatus(): BinaryManagerStatus {
    return this.status;
  }

  private getResourcePaths(): { manifestPath: string; archivesDir: string } {
    if (app.isPackaged) {
      return getPackagedResourcePaths(process.resourcesPath);
    }
    return getDevResourcePaths(__dirname);
  }

  async ensureInstalled(options?: { checkOnly?: boolean }): Promise<void> {
    if (process.platform !== 'win32') {
      this.status = {
        ready: true,
        paths: this.paths,
        error: '非 Windows 平台跳过 bundled 运行时安装',
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
        const error = `运行时未安装，缺少: ${result.missing?.join(', ') ?? 'unknown'}。请运行 pnpm setup:binaries`;
        this.status = { ready: false, paths: this.paths, error };
        throw new Error(error);
      }

      let installed: BinaryInstallRecord | undefined;
      const installedPath = getInstalledPath(homedir());
      if (existsSync(installedPath)) {
        installed = JSON.parse(readFileSync(installedPath, 'utf-8')) as BinaryInstallRecord;
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

  /** 初始化 store 目录与 Python；bundled env 仅注入 Agent 子进程，不改全局 process.env */
  applyBaseEnv(): void {
    this.ensureStoreDirectories();
    try {
      ensurePythonRuntime(this.paths, (message) => console.info(`[runtime] ${message}`));
    } catch (error) {
      console.warn('[runtime] Python 初始化失败:', error instanceof Error ? error.message : error);
    }
  }

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

export function setBinaryManager(manager: BinaryManager): void {
  binaryManager = manager;
}

export function getBinaryManager(): BinaryManager | null {
  return binaryManager;
}

export function getBinaryManagerPaths(): AppRuntimePaths {
  return binaryManager?.getPaths() ?? getAppRuntimePaths();
}

export function isRuntimeReady(): boolean {
  return binaryManager?.getStatus().ready ?? false;
}

export function getRuntimeInitError(): string | undefined {
  return binaryManager?.getStatus().error;
}
