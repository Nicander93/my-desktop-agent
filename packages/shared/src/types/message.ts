/**
 * 流式 assistant 消息的结构化片段；thinking 与 text 分开渲染，tool_group 聚合卡片。
 */
export type MessagePart =
  | { type: 'thinking'; id: string; text: string }
  | { type: 'text'; id: string; text: string }
  | { type: 'tool_group'; id: string; toolCallIds: string[] };
