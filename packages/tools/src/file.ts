import { Tool, ToolResult } from '@desktop-agent/shared';
import { toolRegistry } from './registry.js';

export const fileTool: Tool = {
  name: 'file',
  description: '文件操作工具',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'list', 'move', 'delete', 'copy']
      },
      path: { type: 'string' },
      content: { type: 'string' },
      destination: { type: 'string' }
    },
    required: ['action', 'path']
  },
  async execute(input: unknown): Promise<ToolResult> {
    // TODO: 实现文件操作
    return { success: true, data: 'File tool placeholder' };
  }
};

toolRegistry.register(fileTool);