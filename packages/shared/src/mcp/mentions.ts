const MCP_MENTION_REGEX = /\$([a-zA-Z][a-zA-Z0-9_-]*)/g;

export function parseMcpMentions(content: string): string[] {
  const mentions = new Set<string>();
  for (const match of content.matchAll(MCP_MENTION_REGEX)) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
}

export function buildMcpMentionPrompt(mcpMentions: string[]): string {
  if (mcpMentions.length === 0) return '';

  const lines = [
    '用户在本轮消息中通过 $ 指定了以下 MCP，请优先使用对应工具：',
    ...mcpMentions.map((name) => `- ${name}（工具名前缀 mcp__${name}__）`),
  ];
  return lines.join('\n');
}
