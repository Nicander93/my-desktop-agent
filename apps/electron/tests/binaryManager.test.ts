import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  loadManifest,
  areAllRuntimesInstalled,
  getBinariesRoot,
  getDevResourcePaths,
} from '../src/runtime/install.js';

describe('runtime install', () => {
  it('loads Windows runtime manifest', () => {
    const { manifestPath } = getDevResourcePaths(join(import.meta.dirname, '../src/runtime'));
    const manifest = loadManifest(manifestPath);
    expect(manifest.platform).toBe('win32-x64');
    expect(manifest.runtimes.node.version).toBeTruthy();
    expect(manifest.runtimes.git.verifyFile).toBe('cmd/git.exe');
  });

  it('detects missing runtimes in empty home', () => {
    const { manifestPath } = getDevResourcePaths(join(import.meta.dirname, '../src/runtime'));
    const manifest = loadManifest(manifestPath);
    const fakeHome = 'C:/tmp/desktop-agent-empty-test-home';
    expect(areAllRuntimesInstalled(fakeHome, manifest)).toBe(false);
    expect(getBinariesRoot(fakeHome)).toContain('.desktop-agent');
  });
});
