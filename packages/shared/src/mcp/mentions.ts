/**
 * 解析 $mcp 提及，生成优先使用对应 MCP 工具的 prompt 片段。
 * 名称对应 McpServerRecord.name，工具前缀 mcp__{name}__。
 */
const MCP_MENTION_REGEX = /\$([a-zA-Z][a-zA-Z0-9_-]*)/g;

/**
 * 从用户文本提取去重的 `$mcp` 标识，供运行时优先选择对应工具。
 */
export function parseMcpMentions(content: string): string[] {
  const mentions = new Set<string>();
  for (const match of content.matchAll(MCP_MENTION_REGEX)) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
}

/** 空列表返回空串 */
export function buildMcpMentionPrompt(mcpMentions: string[]): string {
  if (mcpMentions.length === 0) return "";

  const lines = [
    "用户在本轮消息中通过 $ 指定了以下 MCP，请优先使用对应工具：",
    ...mcpMentions.map((name) => `- ${name}（工具名前缀 mcp__${name}__）`),
  ];
  return lines.join("\n");
}
