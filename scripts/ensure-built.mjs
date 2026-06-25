import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const sdkOnly = process.argv.includes('--sdk-only');

const sdkDir = join(root, 'packages/agent-runtime/node_modules/@codeany/open-agent-sdk');
const sdkDist = join(sdkDir, 'dist/index.js');
const agentDist = join(root, 'packages/agent-runtime/dist/index.js');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

function ensureSdk() {
  if (!force && existsSync(sdkDist)) {
    console.log('[build] SDK already built, skipping');
    return;
  }
  if (!existsSync(join(sdkDir, 'package.json'))) {
    console.error('[build] @codeany/open-agent-sdk not found — run pnpm install first');
    process.exit(1);
  }
  if (force || !existsSync(join(sdkDir, 'node_modules'))) {
    run(`npm install --prefix "${sdkDir}" --include=dev`);
  }
  run(`npm run build --prefix "${sdkDir}"`);
}

function ensurePackages() {
  if (!force && existsSync(agentDist)) {
    console.log('[build] workspace packages already built, skipping');
    return;
  }
  run('pnpm exec tsc -b packages/agent-runtime');
}

ensureSdk();
if (!sdkOnly) {
  ensurePackages();
}
