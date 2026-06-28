import { describe, it, expect } from 'vitest';
import {
  buildMcpMentionPrompt,
  buildMcpServersForSdk,
  parseMcpMentions,
  parseCommandLine,
} from '../src/index.js';
import type { McpServerRecord } from '../src/types/mcp.js';

describe('parseMcpMentions', () => {
  it('extracts unique mentions', () => {
    expect(parseMcpMentions('$filesystem 列出 $markitdown 分析')).toEqual([
      'filesystem',
      'markitdown',
    ]);
  });
});

describe('buildMcpMentionPrompt', () => {
  it('builds hint for agent', () => {
    const prompt = buildMcpMentionPrompt(['filesystem']);
    expect(prompt).toContain('filesystem');
    expect(prompt).toContain('mcp__filesystem__');
  });
});

describe('buildMcpServersForSdk', () => {
  it('replaces workspace placeholder', () => {
    const servers: McpServerRecord[] = [{
      id: '1',
      name: 'filesystem',
      displayName: 'Filesystem',
      description: '',
      source: 'catalog',
      catalogId: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server', '{workspace}'],
      url: null,
      env: {},
      enabled: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    }];

    const config = buildMcpServersForSdk(servers, { workspacePath: 'D:/proj' });
    expect(config.filesystem.args).toEqual(['-y', 'server', 'D:/proj']);
  });
});

describe('parseCommandLine', () => {
  it('splits command and args', () => {
    expect(parseCommandLine('npx -y @scope/pkg arg')).toEqual({
      command: 'npx',
      args: ['-y', '@scope/pkg', 'arg'],
    });
  });
});
