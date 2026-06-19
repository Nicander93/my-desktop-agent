import { Tool, ToolResult } from '@desktop-agent/shared';
import { toolRegistry } from './registry.js';

export const shellTool: Tool = {
  name: 'shell',
  description: 'Shell命令执行工具',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      cwd: { type: 'string' },
      timeout: { type: 'number' }
    },
    required: ['command']
  },
  async execute(input: unknown): Promise<ToolResult> {
    // TODO: 实现Shell执行
    return { success: true, data: 'Shell tool placeholder' };
  }
};

toolRegistry.register(shellTool);