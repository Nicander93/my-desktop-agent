import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAgent = {
  getSessionId: vi.fn(),
  getMessages: vi.fn(() => []),
  close: vi.fn(),
  query: vi.fn(),
  prompt: vi.fn()
};

vi.mock('@codeany/open-agent-sdk', () => ({
  createAgent: vi.fn(() => mockAgent),
  registerSkill: vi.fn(),
  unregisterSkill: vi.fn(),
}));

import { createAgent } from '@codeany/open-agent-sdk';
import { AgentRuntime } from '../src';

describe('AgentRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.getSessionId.mockReturnValue('session-1');
    mockAgent.query.mockReturnValue((async function* () {})());
  });

  it('should create an agent for a session', () => {
    const runtime = new AgentRuntime();
    const agent = runtime.createAgent('session-1');

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        persistSession: true,
        promptCache: { enabled: true, ttl: '5m' },
      })
    );
    expect(agent).toBe(mockAgent);
  });

  it('should allow prompt cache defaults to be overridden', () => {
    const runtime = new AgentRuntime({ promptCache: { enabled: true, ttl: '1h' } });
    runtime.createAgent('session-1');

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        promptCache: { enabled: true, ttl: '1h' },
      })
    );
  });

  it('should create an agent with session-specific cwd and workspaceId', () => {
    const runtime = new AgentRuntime({ cwd: '/default', permissionMode: 'default' });
    const checker = vi.fn(async () => ({ allowed: true }));
    runtime.setPathAccessChecker(checker);
    runtime.createAgent('session-1', { cwd: '/workspace/dbx', workspaceId: 'ws-1' });

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        cwd: '/workspace/dbx',
        permissionMode: 'default',
        canUseTool: expect.any(Function)
      })
    );
    expect(runtime.getSessionWorkspaceId('session-1')).toBe('ws-1');
  });

  it('can omit host environment context for an isolated workspace', () => {
    const runtime = new AgentRuntime({ includeEnvironmentContext: false });
    runtime.createAgent('session-1');

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ includeEnvironmentContext: false }),
    );
  });

  it('binds a session to its model config and rebuilds it when the config changes', () => {
    const runtime = new AgentRuntime({ model: 'fallback', baseURL: 'https://fallback.example/v1', apiKey: 'fallback-key' });
    runtime.createAgent('session-1', { modelConfig: { id: 'local-1', model: 'qwen2.5-coder:7b', baseURL: 'http://127.0.0.1:11434/v1', apiKey: null } });
    runtime.createAgent('session-1', { modelConfig: { id: 'local-2', model: 'qwen3:8b', baseURL: 'http://127.0.0.1:11434/v1', apiKey: null } });

    expect(createAgent).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: 'qwen2.5-coder:7b', baseURL: 'http://127.0.0.1:11434/v1', apiKey: '' }));
    expect(createAgent).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: 'qwen3:8b', baseURL: 'http://127.0.0.1:11434/v1', apiKey: '' }));
    expect(mockAgent.close).toHaveBeenCalledTimes(1);
  });

  it('should apply office profile query overrides', async () => {
    const runtime = new AgentRuntime({
      maxTurns: 50,
      thinking: { type: 'enabled', budgetTokens: 8000 },
    });

    await runtime.sendMessage(
      'session-1',
      '帮我做一个介绍 MCP 的 ppt',
      undefined,
      { profile: 'office', skillMentions: ['officecli'] },
    );

    const [, overrides] = mockAgent.query.mock.calls[0]!;
    expect(overrides).toEqual(expect.objectContaining({
      maxTurns: 8,
      thinking: { type: 'disabled' },
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    }));
    expect(overrides.appendSystemPrompt).toContain('禁止 Bash 执行：officecli open');
    expect(overrides.appendSystemPrompt).toContain('Desktop Agent 版');
    expect(overrides.appendSystemPrompt).not.toContain('运行 CLI 命令：officecli load_skill');
  });
});
