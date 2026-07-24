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
  'packages/agent-eval/src',
  'packages/open-agent-sdk/src',
];

for (const target of targets) {
  const cmd = `pnpm exec depcruise "${join(root, target)}" --config "${config}"`;
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' } });
}
