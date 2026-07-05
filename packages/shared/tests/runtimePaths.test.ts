import { describe, it, expect } from 'vitest';
import { normalize } from 'path';
import {
  getAppRuntimePaths,
  buildAppLevelEnv,
  buildCodingEnv,
  buildBundledPathEnv,
  resolveBundledCommand,
  resolveCommandIfBundled,
} from '../src/runtime/paths.js';

const home = 'C:/Users/Test';

function n(path: string): string {
  return normalize(path);
}

describe('getAppRuntimePaths', () => {
  it('builds expected directory layout', () => {
    const paths = getAppRuntimePaths(home);
    expect(paths.root).toBe(n('C:/Users/Test/.desktop-agent'));
    expect(paths.binaries.node).toBe(n('C:/Users/Test/.desktop-agent/binaries/node'));
    expect(paths.binaries.git).toBe(n('C:/Users/Test/.desktop-agent/binaries/git/cmd'));
    expect(paths.store.npmPrefix).toBe(n('C:/Users/Test/.desktop-agent/store/npm/prefix'));
    expect(paths.store.uvTools).toBe(n('C:/Users/Test/.desktop-agent/store/uv/tools'));
  });
});

describe('buildAppLevelEnv', () => {
  it('prepends bundled paths and sets store env on Windows', () => {
    const paths = getAppRuntimePaths(home);
    const env = buildAppLevelEnv(paths, { PATH: 'C:/Windows/system32' }, 'win32');

    expect(env.PATH).toContain(paths.binaries.node);
    expect(env.PATH).toContain(paths.binaries.git);
    expect(env.PATH).toContain('C:/Windows/system32');
    expect(env.NPM_CONFIG_PREFIX).toBe(paths.store.npmPrefix);
    expect(env.UV_TOOL_DIR).toBe(paths.store.uvTools);
  });
});

describe('buildCodingEnv', () => {
  it('keeps bundled PATH without npm prefix', () => {
    const paths = getAppRuntimePaths(home);
    const env = buildCodingEnv(paths, { PATH: 'C:/existing' }, 'win32');

    expect(env.PATH).toContain(paths.binaries.node);
    expect(env.NPM_CONFIG_PREFIX).toBeUndefined();
    expect(env.UV_CACHE_DIR).toBe(paths.store.uvCache);
  });
});

describe('buildBundledPathEnv', () => {
  it('uses colon separator on unix', () => {
    const paths = getAppRuntimePaths('/home/test');
    const pathValue = buildBundledPathEnv(paths, '/usr/bin', 'linux');
    expect(pathValue.startsWith(`${paths.binaries.node}:`)).toBe(true);
    expect(pathValue).toContain('/usr/bin');
  });
});

describe('resolveBundledCommand', () => {
  it('resolves Windows executables', () => {
    const paths = getAppRuntimePaths(home);
    expect(resolveBundledCommand(paths, 'npx', 'win32')).toBe(
      n('C:/Users/Test/.desktop-agent/binaries/node/npx.cmd'),
    );
    expect(resolveBundledCommand(paths, 'git', 'win32')).toBe(
      n('C:/Users/Test/.desktop-agent/binaries/git/cmd/git.exe'),
    );
    expect(resolveBundledCommand(paths, 'uvx', 'win32')).toBe(
      n('C:/Users/Test/.desktop-agent/binaries/uv/uvx.exe'),
    );
  });
});

describe('resolveCommandIfBundled', () => {
  it('resolves known commands only', () => {
    const paths = getAppRuntimePaths(home);
    expect(resolveCommandIfBundled(paths, 'npx', 'win32')).toContain('npx.cmd');
    expect(resolveCommandIfBundled(paths, 'custom-tool', 'win32')).toBe('custom-tool');
  });
});
