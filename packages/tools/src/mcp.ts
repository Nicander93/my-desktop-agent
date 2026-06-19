import { Tool, ToolResult } from '@desktop-agent/shared';
import { toolRegistry } from './registry.js';

export const mcpTool: Tool = {
  name: 'mcp',
  description: 'MCP工具调用',
  parameters: {
    type: 'object',
    properties: {
      server: { type: 'string' },
      method: { type: 'string' },
      params: { type: 'object' }
    },
    required: ['server', 'method']
  },
  async execute(input: unknown): Promise<ToolResult> {
    // TODO: 实现MCP调用
    return { success: true, data: 'MCP tool placeholder' };
  }
};

toolRegistry.register(mcpTool);