/**
 * App 级 bundled 运行时（node / git / uv）安装逻辑。
 *
 * 由 Electron 主进程（打包进 main.js）和 setup-binaries CLI 共用。
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

/** 单个 bundled runtime 的来源、解压布局与安装校验契约。 */
export interface RuntimeManifestEntry {
  version: string;
  archive: string;
  archiveType?: "zip" | "7z-sfx";
  url: string;
  mirrorUrl?: string;
  extractDir: string;
  stripTopLevelDir: boolean;
  verifyFile: string;
  sha256?: string;
}

/** 与安装包一同发布的运行时清单。 */
export interface RuntimeManifest {
  version: number;
  platform: string;
  runtimes: Record<string, RuntimeManifestEntry>;
}

/** 安装成功后写入用户目录的诊断记录。 */
export interface BinaryInstallRecord {
  manifestVersion: number;
  platform: string;
  installedAt: string;
  runtimes: Record<string, string>;
}

/** 下载与解压阶段向 UI/CLI 汇报的进度事件。 */
export interface InstallProgressEvent {
  stage?: "download" | "extract";
  runtime?: string;
  message?: string;
  downloaded?: number;
  total?: number;
  percent?: number;
}

/** 批量检查或安装 bundled runtime 的可选依赖与回调。 */
export interface EnsureBinariesOptions {
  homeDir?: string;
  manifestPath?: string;
  archivesDir?: string;
  onProgress?: (event: InstallProgressEvent) => void;
  checkOnly?: boolean;
}

/** bundled runtime 检查或安装的结果。 */
export interface EnsureBinariesResult {
  installed: boolean;
  manifest: RuntimeManifest;
  record?: BinaryInstallRecord;
  missing?: string[];
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * 解析开发模式下相对编译目录的 manifest 与本地归档路径。
 *
 * 同时兼容直接运行源码与编译输出，优先选择真实存在的清单位置。
 */
export function getDevResourcePaths(moduleDirectory = moduleDir): {
  manifestPath: string;
  archivesDir: string;
} {
  const candidates = [
    join(moduleDirectory, "../resources/binaries/manifest.json"),
    join(moduleDirectory, "../../resources/binaries/manifest.json"),
  ];

  for (const manifestPath of candidates) {
    if (existsSync(manifestPath)) {
      return {
        manifestPath,
        archivesDir: join(dirname(manifestPath), "archives"),
      };
    }
  }

  const manifestPath = candidates[0]!;
  return {
    manifestPath,
    archivesDir: join(dirname(manifestPath), "archives"),
  };
}

/**
 * 解析打包后 `extraResources` 中的 manifest 与归档路径。
 */
export function getPackagedResourcePaths(resourcesPath: string): {
  manifestPath: string;
  archivesDir: string;
} {
  const base = join(resourcesPath, "binaries");
  return {
    manifestPath: join(base, "manifest.json"),
    archivesDir: join(base, "archives"),
  };
}

/** 返回当前用户的配置根目录；测试可改由显式 `homeDir` 隔离。 */
export function getDefaultHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || "";
}

/** 计算应用独占的 bundled runtime 安装根目录。 */
export function getBinariesRoot(homeDir = getDefaultHomeDir()): string {
  return join(homeDir, ".desktop-agent", "binaries");
}

/** 返回安装记录路径，不以记录本身作为可执行文件存在性的依据。 */
export function getInstalledPath(homeDir = getDefaultHomeDir()): string {
  return join(getBinariesRoot(homeDir), "installed.json");
}

/** 读取随应用分发的运行时清单；缺失或格式错误应尽早暴露为启动问题。 */
export function loadManifest(manifestPath: string): RuntimeManifest {
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as RuntimeManifest;
}

/** 通过清单指定的验证文件判断 runtime 是否实际可用。 */
export function isRuntimeInstalled(
  homeDir: string,
  runtimeDef: RuntimeManifestEntry,
): boolean {
  const targetDir = join(getBinariesRoot(homeDir), runtimeDef.extractDir);
  const verifyPath = join(targetDir, runtimeDef.verifyFile);
  return existsSync(verifyPath);
}

/** 逐项确认清单要求的 runtime，避免只依赖可能过期的安装记录。 */
export function areAllRuntimesInstalled(
  homeDir: string,
  manifest: RuntimeManifest,
): boolean {
  return Object.values(manifest.runtimes).every((def) =>
    isRuntimeInstalled(homeDir, def),
  );
}

/** 流式计算归档 SHA-256，避免大体积安装包整体载入内存。 */
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/** 按镜像优先、官方源兜底生成下载地址，提升受限网络下的安装成功率。 */
function getDownloadUrls(runtimeDef: RuntimeManifestEntry): string[] {
  const urls: string[] = [];
  if (runtimeDef.mirrorUrl) urls.push(runtimeDef.mirrorUrl);

  if (runtimeDef.url.includes("nodejs.org/dist/")) {
    urls.push(
      runtimeDef.url.replace(
        "https://nodejs.org/dist/",
        "https://cdn.npmmirror.com/binaries/node/",
      ),
    );
  }

  if (runtimeDef.url.includes("github.com/")) {
    for (const mirror of [
      `https://ghproxy.net/${runtimeDef.url}`,
      `https://mirror.ghproxy.com/${runtimeDef.url}`,
      `https://ghfast.top/${runtimeDef.url}`,
    ]) {
      if (!urls.includes(mirror)) urls.push(mirror);
    }
  }

  if (!urls.includes(runtimeDef.url)) urls.push(runtimeDef.url);
  return urls;
}

/** 在复用本地归档前执行轻量完整性检查，损坏缓存必须重新下载。 */
function isValidArchiveFile(
  filePath: string,
  archiveType: RuntimeManifestEntry["archiveType"] = "zip",
): boolean {
  if (!existsSync(filePath)) return false;
  if (archiveType === "7z-sfx") {
    return statSync(filePath).size > 1024 * 1024;
  }
  return isValidZipFile(filePath);
}

/** 检查 ZIP 尾部目录签名；这不是安全校验，只用于拒绝明显不完整的下载。 */
function isValidZipFile(filePath: string): boolean {
  const fd = openSync(filePath, "r");
  try {
    const { size } = fstatSync(fd);
    if (size < 22) return false;

    const readSize = Math.min(size, 65557);
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, readSize, size - readSize);

    for (let i = buf.length - 22; i >= 0; i--) {
      if (
        buf[i] === 0x50 &&
        buf[i + 1] === 0x4b &&
        buf[i + 2] === 0x05 &&
        buf[i + 3] === 0x06
      ) {
        return true;
      }
    }
    return false;
  } finally {
    closeSync(fd);
  }
}

/** 下载归档并以背压写入磁盘；失败时删除部分文件，避免缓存污染。 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (event: {
    downloaded: number;
    total: number;
    percent: number;
  }) => void,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `下载失败 ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const total = Number(response.headers.get("content-length") || 0);
  let downloaded = 0;
  const fileStream = createWriteStream(destPath);
  const streamError = new Promise<never>((_, reject) => {
    fileStream.once("error", reject);
  });

  if (!response.body) {
    fileStream.destroy();
    throw new Error(`下载失败 ${url}: empty body`);
  }

  try {
    for await (const chunk of response.body) {
      await Promise.race([
        (async () => {
          downloaded += chunk.length;
          if (!fileStream.write(chunk)) {
            await new Promise<void>((resolve) =>
              fileStream.once("drain", resolve),
            );
          }
          if (onProgress && total > 0) {
            onProgress({
              downloaded,
              total,
              percent: Math.round((downloaded / total) * 100),
            });
          }
        })(),
        streamError,
      ]);
    }

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.once("error", reject);
      }),
      streamError,
    ]);
  } catch (error) {
    fileStream.destroy();
    if (existsSync(destPath)) rmSync(destPath, { force: true });
    throw error;
  }

  const actualSize = statSync(destPath).size;
  if (total > 0 && actualSize !== total) {
    rmSync(destPath, { force: true });
    throw new Error(
      `下载不完整 ${basename(destPath)}: 期望 ${total} 字节，实际 ${actualSize} 字节`,
    );
  }
}

/** 优先使用随包归档或有效缓存，否则在多个镜像间重试下载。 */
async function ensureArchiveFile(options: {
  runtimeKey: string;
  runtimeDef: RuntimeManifestEntry;
  archivesDir: string;
  cacheArchive: string;
  onProgress?: (event: InstallProgressEvent) => void;
}): Promise<string> {
  const { runtimeKey, runtimeDef, archivesDir, cacheArchive, onProgress } =
    options;

  const localPath = resolveArchivePath(runtimeDef, archivesDir);
  const archiveType = runtimeDef.archiveType ?? "zip";
  if (localPath && isValidArchiveFile(localPath, archiveType)) {
    return localPath;
  }

  mkdirSync(dirname(cacheArchive), { recursive: true });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (existsSync(cacheArchive)) {
      if (isValidArchiveFile(cacheArchive, archiveType)) {
        return cacheArchive;
      }
      rmSync(cacheArchive, { force: true });
      onProgress?.({
        stage: "download",
        runtime: runtimeKey,
        message: `缓存损坏，重新下载 ${runtimeKey} ${runtimeDef.version}...`,
      });
    } else if (attempt === 1) {
      onProgress?.({
        stage: "download",
        runtime: runtimeKey,
        message: `下载 ${runtimeKey} ${runtimeDef.version}...`,
      });
    }

    const urls = getDownloadUrls(runtimeDef);
    let lastError: unknown;

    for (const url of urls) {
      try {
        onProgress?.({
          stage: "download",
          runtime: runtimeKey,
          message: `下载 ${runtimeKey} ${runtimeDef.version} (${new URL(url).host})...`,
        });
        await downloadFile(url, cacheArchive, (p) => {
          onProgress?.({ stage: "download", runtime: runtimeKey, ...p });
        });
        if (!isValidArchiveFile(cacheArchive, archiveType)) {
          rmSync(cacheArchive, { force: true });
          throw new Error(`${runtimeDef.archive} 不是有效的归档文件`);
        }
        return cacheArchive;
      } catch (error) {
        if (existsSync(cacheArchive)) rmSync(cacheArchive, { force: true });
        lastError = error;
      }
    }

    if (attempt === maxAttempts) {
      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
    }
    onProgress?.({
      stage: "download",
      runtime: runtimeKey,
      message: `所有镜像均失败，重试 (${attempt}/${maxAttempts})...`,
    });
  }

  throw new Error(`无法获取 ${runtimeDef.archive}`);
}

/** 返回随安装包携带的归档；不存在时由下载缓存路径接管。 */
function resolveArchivePath(
  runtimeDef: RuntimeManifestEntry,
  archivesDir: string,
): string | null {
  const localPath = join(archivesDir, runtimeDef.archive);
  return existsSync(localPath) ? localPath : null;
}

/** 执行 7z 自解压归档，设置超时以避免安装阶段无限阻塞。 */
function extract7zSfx(archivePath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const result = spawnSync(archivePath, [`-o${destDir}`, "-y"], {
    encoding: "utf-8",
    timeout: 10 * 60 * 1000,
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `解压失败: ${archivePath}`,
    );
  }
}

/** 使用 Windows 随附 tar 解压已校验的 ZIP 归档。 */
function extractZipWindows(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  if (!isValidZipFile(zipPath)) {
    throw new Error(`无效的 zip 文件: ${zipPath}`);
  }

  const result = spawnSync("tar", ["-xf", zipPath, "-C", destDir], {
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `解压失败: ${zipPath}`);
  }
}

/** 递归复制解压内容，保留目录层级以适配不同 runtime 的包结构。 */
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

/** 以复制覆盖方式归一化目标目录，避免跨盘 rename 的平台差异。 */
function moveDirectoryContents(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const from = join(sourceDir, entry);
    const to = join(targetDir, entry);
    if (existsSync(to)) rmSync(to, { recursive: true, force: true });
    copyTree(from, to);
  }
}

/** 创建临时解压目录并清理旧目标，安装完成前不暴露半成品目录。 */
function normalizeExtractedRuntime(
  runtimeDef: RuntimeManifestEntry,
  binariesRoot: string,
): {
  targetDir: string;
  tempDir: string;
} {
  const targetDir = join(binariesRoot, runtimeDef.extractDir);
  const tempDir = join(binariesRoot, `.tmp-${runtimeDef.extractDir}`);

  if (existsSync(targetDir))
    rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  return { targetDir, tempDir };
}

/**
 * 下载（或复用）并安装一个 runtime。
 *
 * 归档哈希、解压结果和验证文件都必须通过；任一步失败不得写入安装记录。
 */
export async function installRuntime(options: {
  homeDir: string;
  runtimeKey: string;
  runtimeDef: RuntimeManifestEntry;
  archivesDir: string;
  onProgress?: (event: InstallProgressEvent) => void;
}): Promise<{ runtimeKey: string; version: string; targetDir: string }> {
  const { homeDir, runtimeKey, runtimeDef, archivesDir, onProgress } = options;

  if (process.platform !== "win32") {
    throw new Error("当前仅支持 Windows x64 运行时安装");
  }

  const binariesRoot = getBinariesRoot(homeDir);
  mkdirSync(binariesRoot, { recursive: true });

  const cacheArchive = join(binariesRoot, ".cache", runtimeDef.archive);
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

  const { targetDir, tempDir } = normalizeExtractedRuntime(
    runtimeDef,
    binariesRoot,
  );
  onProgress?.({
    stage: "extract",
    runtime: runtimeKey,
    message: `解压 ${basename(archivePath)}...`,
  });
  const archiveType = runtimeDef.archiveType ?? "zip";
  if (archiveType === "7z-sfx") {
    extract7zSfx(archivePath, tempDir);
  } else {
    extractZipWindows(archivePath, tempDir);
  }

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
    throw new Error(
      `${runtimeKey} 安装校验失败，缺少 ${runtimeDef.verifyFile}`,
    );
  }

  return { runtimeKey, version: runtimeDef.version, targetDir };
}

/**
 * 检查或安装清单中的全部 runtime。
 *
 * `checkOnly` 绝不写入文件，可供设置页和启动前诊断安全调用。
 */
export async function ensureBinariesInstalled(
  options: EnsureBinariesOptions = {},
): Promise<EnsureBinariesResult> {
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
    await installRuntime({
      homeDir,
      runtimeKey,
      runtimeDef,
      archivesDir,
      onProgress: options.onProgress,
    });
    installed[runtimeKey] = runtimeDef.version;
  }

  const record: BinaryInstallRecord = {
    manifestVersion: manifest.version,
    platform: manifest.platform,
    installedAt: new Date().toISOString(),
    runtimes: installed,
  };
  writeFileSync(
    getInstalledPath(homeDir),
    JSON.stringify(record, null, 2),
    "utf-8",
  );

  return { installed: true, manifest, record };
}
