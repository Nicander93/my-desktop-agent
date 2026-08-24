/**
 * 开发前确保 open-agent-sdk 与 workspace 包已 tsc 构建
 */
import { existsSync, realpathSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const sdkOnly = process.argv.includes("--sdk-only");

const sdkDir = join(root, "packages/open-agent-sdk");
const sdkDist = join(sdkDir, "dist/index.js");
const agentDist = join(root, "packages/agent-runtime/dist/index.js");
const newAgentDist = join(root, "packages/agent-runtime-new/dist/index.js");

/**
 * 在仓库根执行构建命令，并将子进程输出直接交给调用终端。
 */
function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

/**
 * 清理由直接 npm 操作 SDK 目录遗留的 lockfile，避免与 workspace 安装状态冲突。
 */
function cleanupNpmPollution(sdkReal) {
  const lockfile = join(sdkReal, "package-lock.json");
  if (existsSync(lockfile)) {
    rmSync(lockfile);
  }
  const npmNodeModules = join(sdkReal, "node_modules", ".package-lock.json");
  if (existsSync(npmNodeModules)) {
    rmSync(join(sdkReal, "node_modules"), { recursive: true, force: true });
  }
}

/** 缺 dist 时编译 SDK */
function ensureSdk() {
  if (!force && existsSync(sdkDist)) {
    console.log("[build] SDK already built, skipping");
    return;
  }
  if (!existsSync(join(sdkDir, "package.json"))) {
    console.error(
      "[build] @codeany/open-agent-sdk not found — run pnpm install first",
    );
    process.exit(1);
  }
  const sdkReal = realpathSync(sdkDir);
  cleanupNpmPollution(sdkReal);
  run(`pnpm --dir "${sdkReal}" exec tsc`);
}

/** 缺 dist 时编译 agent-runtime 等 workspace 包 */
function ensurePackages() {
  if (!force && existsSync(agentDist) && existsSync(newAgentDist)) {
    console.log("[build] workspace packages already built, skipping");
    return;
  }
  run("pnpm exec tsc -b packages/agent-runtime packages/agent-runtime-new");
}

ensureSdk();
if (!sdkOnly) {
  ensurePackages();
}
