import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAgent = {
  getSessionId: vi.fn(),
  getMessages: vi.fn(() => []),
  close: vi.fn(),
  query: vi.fn(),
  prompt: vi.fn()
};

vi.mock('@codeany/open-agent-sdk', () => ({
  createAgent: vi.fn(() => mockAgent)
}));

import { createAgent } from '@codeany/open-agent-sdk';
import { AgentRuntime } from '../src';

describe('AgentRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.getSessionId.mockReturnValue('session-1');
  });

  it('should create an agent for a session', () => {
    const runtime = new AgentRuntime();
    const agent = runtime.createAgent('session-1');

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', persistSession: true })
    );
    expect(agent).toBe(mockAgent);
  });

  it('should get an agent by session id', () => {
    const runtime = new AgentRuntime();
    runtime.createAgent('session-1');
    const retrieved = runtime.getAgent('session-1');

    expect(retrieved).toBe(mockAgent);
  });
});
