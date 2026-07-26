/**
 * 解析用户消息里的 @ 文件引用，拼进 system prompt。
 * 只抽路径字符串，不读盘；读文件交给 agent 工具。
 */
const FILE_MENTION_REGEX = /@([^\s@]+)/g;

/** 去重返回 @ 后的路径片段，顺序不保证 */
export function parseFileMentions(content: string): string[] {
  const mentions = new Set<string>();
  for (const match of content.matchAll(FILE_MENTION_REGEX)) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
}

/** 无引用时返回空串，避免往 prompt 塞空段落 */
export function buildFileMentionPrompt(fileRefs: string[]): string {
  if (fileRefs.length === 0) return '';

  const lines = [
    '用户在本轮消息中通过 @ 引用了以下工作区路径，请使用文件工具按需读取，不要猜测内容：',
    ...fileRefs.map((path) => `- ${path}`),
  ];
  return lines.join('\n');
}
