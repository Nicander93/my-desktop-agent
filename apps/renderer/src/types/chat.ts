/** Renderer 中工具调用的流式展示状态。 */
export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  output?: { success: boolean; data?: unknown; error?: string };
  status: 'pending' | 'running' | 'completed' | 'error';
  startedAt?: number;
  durationMs?: number;
}
