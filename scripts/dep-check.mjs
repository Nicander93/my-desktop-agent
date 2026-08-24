/**
 * 对各 src 目录跑 dependency-cruiser，校验分层与依赖规则
 */
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = join(root, '.dependency-cruiser.cjs');

const targets = [
  'apps/renderer/src',
  'apps/electron/src',
  'packages/shared/src',
  'packages/agent-runtime/src',
  'packages/agent-runtime-new/src',
  'packages/agent-eval/src',
  'packages/open-agent-sdk/src',
];

for (const target of targets) {
  const cmd = `pnpm exec depcruise "${join(root, target)}" --config "${config}"`;
  console.log(`> ${cmd}`);
  const tsConfig = target === 'packages/agent-runtime-new/src' ? 'depcruise.agent-runtime-new.json' : undefined;
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
      ...(tsConfig ? { DEPCRUISE_TSCONFIG: tsConfig } : {}),
    },
  });
}
