import { describe, it, expect } from 'vitest';
import {
  getDependencyScope,
  getAgentEnv,
  buildSubprocessEnv,
  createBundledCommandResolver,
} from '../src/runtime/policy.js';
import { getAppRuntimePaths } from '@desktop-agent/shared/runtime';

const home = 'C:/Users/Test';
const paths = getAppRuntimePaths(home);

describe('getDependencyScope', () => {
  it('uses app scope for office and general profiles', () => {
    expect(getDependencyScope('office')).toBe('app');
    expect(getDependencyScope('general')).toBe('app');
  });

  it('uses workspace scope for coding profile', () => {
    expect(getDependencyScope('coding')).toBe('workspace');
  });
});

describe('getAgentEnv', () => {
  it('includes npm prefix for app scope', () => {
    const env = getAgentEnv('office', paths);
    expect(env.NPM_CONFIG_PREFIX).toBe(paths.store.npmPrefix);
  });

  it('omits npm prefix for coding profile', () => {
    const env = getAgentEnv('coding', paths);
    expect(env.NPM_CONFIG_PREFIX).toBeUndefined();
    expect(env.PATH).toContain(paths.binaries.node);
  });
});

describe('buildSubprocessEnv', () => {
  it('includes npm prefix for office profile', () => {
    const env = buildSubprocessEnv('office', paths);
    expect(env.NPM_CONFIG_PREFIX).toBe(paths.store.npmPrefix);
  });

  it('removes npm prefix for coding even when present in process.env', () => {
    const previous = process.env.NPM_CONFIG_PREFIX;
    process.env.NPM_CONFIG_PREFIX = paths.store.npmPrefix;

    const env = buildSubprocessEnv('coding', paths);
    expect(env.NPM_CONFIG_PREFIX).toBeUndefined();

    if (previous === undefined) {
      delete process.env.NPM_CONFIG_PREFIX;
    } else {
      process.env.NPM_CONFIG_PREFIX = previous;
    }
  });
});

describe('createBundledCommandResolver', () => {
  it('resolves bundled commands', () => {
    const resolve = createBundledCommandResolver(paths);
    expect(resolve('npx')).toContain('npx.cmd');
  });
});
