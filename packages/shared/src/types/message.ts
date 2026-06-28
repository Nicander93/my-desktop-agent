export type MessagePart =
  | { type: 'thinking'; id: string; text: string }
  | { type: 'text'; id: string; text: string }
  | { type: 'tool_group'; id: string; toolCallIds: string[] };
