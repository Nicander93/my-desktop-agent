import { describe, it, expect } from 'vitest';
import { Session, Message, Tool } from '../src';

describe('Shared Types', () => {
  it('should create a session object', () => {
    const session: Session = {
      id: 'test-1',
      messages: [],
      artifacts: [],
      toolCalls: [],
      files: [],
      context: {}
    };
    expect(session.id).toBe('test-1');
    expect(session.messages).toHaveLength(0);
  });

  it('should create a message object', () => {
    const message: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now()
    };
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello');
  });
});