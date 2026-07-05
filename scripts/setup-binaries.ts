#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureBinariesInstalled,
  getBinariesRoot,
  getDefaultHomeDir,
  getDevResourcePaths,
} from '../apps/electron/src/runtime/install.ts';

const checkOnly = process.argv.includes('--check');

function logProgress(event: { stage?: string; runtime?: string; message?: string; percent?: number }) {
  if (event.stage === 'download' && event.percent != null) {
    process.stdout.write(`\r[${event.runtime}] 下载中 ${event.percent}%`);
    if (event.percent >= 100) process.stdout.write('\n');
    return;
  }
  if (event.message) {
    console.log(`[${event.runtime ?? 'setup'}] ${event.message}`);
  }
}

async function main() {
  const homeDir = getDefaultHomeDir();
  if (!homeDir) {
    console.error('无法确定用户主目录');
    process.exit(1);
  }

  if (process.platform !== 'win32') {
    console.error('setup:binaries 当前仅支持 Windows');
    process.exit(1);
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { manifestPath, archivesDir } = getDevResourcePaths(
    join(repoRoot, 'apps/electron/src/runtime'),
  );

  const result = await ensureBinariesInstalled({
    homeDir,
    manifestPath,
    archivesDir,
    onProgress: logProgress,
    checkOnly,
  });

  if (checkOnly && !result.installed) {
    console.warn(`运行时未就绪，缺少: ${result.missing?.join(', ')}`);
    console.warn('请运行: pnpm setup:binaries');
    console.warn(`目标目录: ${getBinariesRoot(homeDir)}`);
    process.exit(1);
  }

  if (!checkOnly) {
    console.log(`运行时已安装到 ${getBinariesRoot(homeDir)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
