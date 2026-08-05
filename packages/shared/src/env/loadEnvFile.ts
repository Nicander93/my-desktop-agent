/**
 * 手动加载 .env 到 process.env；已存在的变量不覆盖。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * 解析一行简单 dotenv 赋值，忽略注释、空行和无效键值对，并去掉匹配引号。
 */
function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice(7).trim()
    : trimmed;
  const eqIndex = withoutExport.indexOf("=");
  if (eqIndex <= 0) return null;

  const key = withoutExport.slice(0, eqIndex).trim();
  let value = withoutExport.slice(eqIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

/** 按路径顺序读取，跳过不存在文件 */
export function loadEnvFile(...paths: string[]): void {
  for (const envPath of paths) {
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/** 从 startDir 向上找 pnpm-workspace.yaml，定位 monorepo 根目录 */
export function findProjectRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** 加载仓库根、apps/、cwd 下的 .env */
export function loadProjectEnv(startDir?: string): void {
  const root = findProjectRoot(startDir);
  loadEnvFile(
    join(root, ".env"),
    join(root, "apps", ".env"),
    join(process.cwd(), ".env"),
  );
}
