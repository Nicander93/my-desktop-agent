import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../src';

describe('Tool Registry', () => {
  it('should register a tool', () => {
    const testTool = {
      name: 'test-tool',
      description: 'Test tool',
      parameters: {},
      execute: async () => ({ success: true })
    };

    toolRegistry.register(testTool);
    expect(toolRegistry.get('test-tool')).toBeDefined();
  });

  it('should list all tools', () => {
    const tools = toolRegistry.list();
    expect(tools.length).toBeGreaterThan(0);
  });
});