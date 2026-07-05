import { describe, it, expect } from 'vitest';
import { resolveSpawnCommandName } from '../src/mcp.js';

describe('resolveSpawnCommandName', () => {
  it('recognizes bundled npx path', () => {
    expect(resolveSpawnCommandName('C:/Users/PC/.desktop-agent/binaries/node/npx.cmd')).toBe('npx');
  });

  it('recognizes bundled uvx path', () => {
    expect(resolveSpawnCommandName('C:/Users/PC/.desktop-agent/binaries/uv/uvx.exe')).toBe('uvx');
  });

  it('recognizes plain command names', () => {
    expect(resolveSpawnCommandName('npx')).toBe('npx');
  });
});
