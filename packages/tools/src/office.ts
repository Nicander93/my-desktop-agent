import { Tool, ToolResult } from '@desktop-agent/shared';
import { toolRegistry } from './registry.js';

export const officeTool: Tool = {
  name: 'office',
  description: 'Office文档处理工具',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'read', 'modify']
      },
      type: {
        type: 'string',
        enum: ['docx', 'pptx', 'xlsx']
      },
      path: { type: 'string' },
      content: { type: 'object' }
    },
    required: ['action', 'type']
  },
  async execute(input: unknown): Promise<ToolResult> {
    // TODO: 实现Office文档处理
    return { success: true, data: 'Office tool placeholder' };
  }
};

toolRegistry.register(officeTool);