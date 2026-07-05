/**
 * App 级 bundled 运行时（node / git / uv）安装逻辑。
 *
 * 由 Electron 主进程（打包进 main.js）和 setup-binaries CLI 共用。
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

export interface RuntimeManifestEntry {
  version: string;
  archive: string;
  url: string;
  mirrorUrl?: string;
  extractDir: string;
  stripTopLevelDir: boolean;
  verifyFile: string;
  sha256?: string;
}

export interface RuntimeManifest {
  version: number;
  platform: string;
  runtimes: Record<string, RuntimeManifestEntry>;
}

export interface BinaryInstallRecord {
  manifestVersion: number;
  platform: string;
  installedAt: string;
  runtimes: Record<string, string>;
}

export interface InstallProgressEvent {
  stage?: 'download' | 'extract';
  runtime?: string;
  message?: string;
  downloaded?: number;
  total?: number;
  percent?: number;
}

export interface EnsureBinariesOptions {
  homeDir?: string;
  manifestPath?: string;
  archivesDir?: string;
  onProgress?: (event: InstallProgressEvent) => void;
  checkOnly?: boolean;
}

export interface EnsureBinariesResult {
  installed: boolean;
  manifest: RuntimeManifest;
  record?: BinaryInstallRecord;
  missing?: string[];
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** 开发模式：相对 electron src/dist 目录的 manifest/archives 路径 */
export function getDevResourcePaths(moduleDirectory = moduleDir): {
  manifestPath: string;
  archivesDir: string;
} {
  const candidates = [
    join(moduleDirectory, '../resources/binaries/manifest.json'),
    join(moduleDirectory, '../../resources/binaries/manifest.json'),
  ];

  for (const manifestPath of candidates) {
    if (existsSync(manifestPath)) {
      return {
        manifestPath,
        archivesDir: join(dirname(manifestPath), 'archives'),
      };
    }
  }

  const manifestPath = candidates[0]!;
  return {
    manifestPath,
    archivesDir: join(dirname(manifestPath), 'archives'),
  };
}

/** 打包后：extraResources 中的 manifest/archives 路径 */
export function getPackagedResourcePaths(resourcesPath: string): {
  manifestPath: string;
  archivesDir: string;
} {
  const base = join(resourcesPath, 'binaries');
  return {
    manifestPath: join(base, 'manifest.json'),
    archivesDir: join(base, 'archives'),
  };
}

export function getDefaultHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || '';
}

export function getBinariesRoot(homeDir = getDefaultHomeDir()): string {
  return join(homeDir, '.desktop-agent', 'binaries');
}

export function getInstalledPath(homeDir = getDefaultHomeDir()): string {
  return join(getBinariesRoot(homeDir), 'installed.json');
}

export function loadManifest(manifestPath: string): RuntimeManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as RuntimeManifest;
}

export function isRuntimeInstalled(homeDir: string, runtimeDef: RuntimeManifestEntry): boolean {
  const targetDir = join(getBinariesRoot(homeDir), runtimeDef.extractDir);
  const verifyPath = join(targetDir, runtimeDef.verifyFile);
  return existsSync(verifyPath);
}

export function areAllRuntimesInstalled(homeDir: string, manifest: RuntimeManifest): boolean {
  return Object.values(manifest.runtimes).every((def) => isRuntimeInstalled(homeDir, def));
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

function getDownloadUrls(runtimeDef: RuntimeManifestEntry): string[] {
  const urls: string[] = [];
  if (runtimeDef.mirrorUrl) urls.push(runtimeDef.mirrorUrl);
  if (runtimeDef.url.includes('nodejs.org/dist/')) {
    urls.push(runtimeDef.url.replace('https://nodejs.org/dist/', 'https://cdn.npmmirror.com/binaries/node/'));
  }
  if (runtimeDef.url.includes('github.com/')) {
    urls.push(`https://mirror.ghproxy.com/${runtimeDef.url}`);
  }
  urls.push(runtimeDef.url);
  return [...new Set(urls)];
}

function isValidZipFile(filePath: string): boolean {
  const fd = openSync(filePath, 'r');
  try {
    const { size } = fstatSync(fd);
    if (size < 22) return false;

    const readSize = Math.min(size, 65557);
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, readSize, size - readSize);

    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        return true;
      }
    }
    return false;
  } finally {
    closeSync(fd);
  }
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (event: { downloaded: number; total: number; percent: number }) => void,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败 ${url}: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get('content-length') || 0);
  let downloaded = 0;
  const fileStream = createWriteStream(destPath);

  if (!response.body) {
    throw new Error(`下载失败 ${url}: empty body`);
  }

  try {
    for await (const chunk of response.body) {
      downloaded += chunk.length;
      if (!fileStream.write(chunk)) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }
      if (onProgress && total > 0) {
        onProgress({ downloaded, total, percent: Math.round((downloaded / total) * 100) });
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve());
      fileStream.on('error', reject);
    });
  } catch (error) {
    fileStream.destroy();
    if (existsSync(destPath)) rmSync(destPath, { force: true });
    throw error;
  }

  const actualSize = statSync(destPath).size;
  if (total > 0 && actualSize !== total) {
    rmSync(destPath, { force: true });
    throw new Error(`下载不完整 ${basename(destPath)}: 期望 ${total} 字节，实际 ${actualSize} 字节`);
  }
}

async function ensureArchiveFile(options: {
  runtimeKey: string;
  runtimeDef: RuntimeManifestEntry;
  archivesDir: string;
  cacheArchive: string;
  onProgress?: (event: InstallProgressEvent) => void;
}): Promise<string> {
  const { runtimeKey, runtimeDef, archivesDir, cacheArchive, onProgress } = options;

  const localPath = resolveArchivePath(runtimeDef, archivesDir);
  if (localPath && isValidZipFile(localPath)) {
    return localPath;
  }

  mkdirSync(dirname(cacheArchive), { recursive: true });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (existsSync(cacheArchive)) {
      if (isValidZipFile(cacheArchive)) {
        return cacheArchive;
      }
      rmSync(cacheArchive, { force: true });
      onProgress?.({
        stage: 'download',
        runtime: runtimeKey,
        message: `缓存损坏，重新下载 ${runtimeKey} ${runtimeDef.version}...`,
      });
    } else if (attempt === 1) {
      onProgress?.({
        stage: 'download',
        runtime: runtimeKey,
        message: `下载 ${runtimeKey} ${runtimeDef.version}...`,
      });
    }

    const urls = getDownloadUrls(runtimeDef);
    let lastError: unknown;

    for (const url of urls) {
      try {
        onProgress?.({
          stage: 'download',
          runtime: runtimeKey,
          message: `下载 ${runtimeKey} ${runtimeDef.version} (${new URL(url).host})...`,
        });
        await downloadFile(url, cacheArchive, (p) => {
          onProgress?.({ stage: 'download', runtime: runtimeKey, ...p });
        });
        if (!isValidZipFile(cacheArchive)) {
          rmSync(cacheArchive, { force: true });
          throw new Error(`${runtimeDef.archive} 不是有效的 zip 文件`);
        }
        return cacheArchive;
      } catch (error) {
        if (existsSync(cacheArchive)) rmSync(cacheArchive, { force: true });
        lastError = error;
      }
    }

    if (attempt === maxAttempts) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    onProgress?.({
      stage: 'download',
      runtime: runtimeKey,
      message: `所有镜像均失败，重试 (${attempt}/${maxAttempts})...`,
    });
  }

  throw new Error(`无法获取 ${runtimeDef.archive}`);
}

function resolveArchivePath(runtimeDef: RuntimeManifestEntry, archivesDir: string): string | null {
  const localPath = join(archivesDir, runtimeDef.archive);
  return existsSync(localPath) ? localPath : null;
}

function extractZipWindows(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  if (!isValidZipFile(zipPath)) {
    throw new Error(`无效的 zip 文件: ${zipPath}`);
  }

  const result = spawnSync('tar', ['-xf', zipPath, '-C', destDir], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `解压失败: ${zipPath}`);
  }
}

function copyTree(from: string, to: string): void {
  const stat = statSync(from);
  if (stat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      copyTree(join(from, entry), join(to, entry));
    }
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function moveDirectoryContents(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const from = join(sourceDir, entry);
    const to = join(targetDir, entry);
    if (existsSync(to)) rmSync(to, { recursive: true, force: true });
    copyTree(from, to);
  }
}

function normalizeExtractedRuntime(runtimeDef: RuntimeManifestEntry, binariesRoot: string): {
  targetDir: string;
  tempDir: string;
} {
  const targetDir = join(binariesRoot, runtimeDef.extractDir);
  const tempDir = join(binariesRoot, `.tmp-${runtimeDef.extractDir}`);

  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  return { targetDir, tempDir };
}

export async function installRuntime(options: {
  homeDir: string;
  runtimeKey: string;
  runtimeDef: RuntimeManifestEntry;
  archivesDir: string;
  onProgress?: (event: InstallProgressEvent) => void;
}): Promise<{ runtimeKey: string; version: string; targetDir: string }> {
  const { homeDir, runtimeKey, runtimeDef, archivesDir, onProgress } = options;

  if (process.platform !== 'win32') {
    throw new Error('当前仅支持 Windows x64 运行时安装');
  }

  const binariesRoot = getBinariesRoot(homeDir);
  mkdirSync(binariesRoot, { recursive: true });

  const cacheArchive = join(binariesRoot, '.cache', runtimeDef.archive);
  const archivePath = await ensureArchiveFile({
    runtimeKey,
    runtimeDef,
    archivesDir,
    cacheArchive,
    onProgress,
  });

  if (runtimeDef.sha256) {
    const hash = await sha256File(archivePath);
    if (hash !== runtimeDef.sha256) {
      throw new Error(`${runtimeDef.archive} sha256 校验失败`);
    }
  }

  const { targetDir, tempDir } = normalizeExtractedRuntime(runtimeDef, binariesRoot);
  onProgress?.({ stage: 'extract', runtime: runtimeKey, message: `解压 ${basename(archivePath)}...` });
  extractZipWindows(archivePath, tempDir);

  if (runtimeDef.stripTopLevelDir) {
    const entries = readdirSync(tempDir);
    if (entries.length === 1) {
      moveDirectoryContents(join(tempDir, entries[0]!), targetDir);
    } else {
      moveDirectoryContents(tempDir, targetDir);
    }
  } else {
    moveDirectoryContents(tempDir, targetDir);
  }

  rmSync(tempDir, { recursive: true, force: true });

  const verifyPath = join(targetDir, runtimeDef.verifyFile);
  if (!existsSync(verifyPath)) {
    throw new Error(`${runtimeKey} 安装校验失败，缺少 ${runtimeDef.verifyFile}`);
  }

  return { runtimeKey, version: runtimeDef.version, targetDir };
}

export async function ensureBinariesInstalled(options: EnsureBinariesOptions = {}): Promise<EnsureBinariesResult> {
  const homeDir = options.homeDir ?? getDefaultHomeDir();
  const devDefaults = getDevResourcePaths();
  const manifestPath = options.manifestPath ?? devDefaults.manifestPath;
  const archivesDir = options.archivesDir ?? devDefaults.archivesDir;
  const manifest = loadManifest(manifestPath);

  if (areAllRuntimesInstalled(homeDir, manifest)) {
    return { installed: true, manifest };
  }

  if (options.checkOnly) {
    return {
      installed: false,
      manifest,
      missing: Object.keys(manifest.runtimes).filter(
        (key) => !isRuntimeInstalled(homeDir, manifest.runtimes[key]!),
      ),
    };
  }

  const installed: Record<string, string> = {};
  for (const [runtimeKey, runtimeDef] of Object.entries(manifest.runtimes)) {
    if (isRuntimeInstalled(homeDir, runtimeDef)) {
      installed[runtimeKey] = runtimeDef.version;
      continue;
    }
    await installRuntime({ homeDir, runtimeKey, runtimeDef, archivesDir, onProgress: options.onProgress });
    installed[runtimeKey] = runtimeDef.version;
  }

  const record: BinaryInstallRecord = {
    manifestVersion: manifest.version,
    platform: manifest.platform,
    installedAt: new Date().toISOString(),
    runtimes: installed,
  };
  writeFileSync(getInstalledPath(homeDir), JSON.stringify(record, null, 2), 'utf-8');

  return { installed: true, manifest, record };
}
