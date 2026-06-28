const FILE_MENTION_REGEX = /@([^\s@]+)/g;

export function parseFileMentions(content: string): string[] {
  const mentions = new Set<string>();
  for (const match of content.matchAll(FILE_MENTION_REGEX)) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
}

export function buildFileMentionPrompt(fileRefs: string[]): string {
  if (fileRefs.length === 0) return '';

  const lines = [
    '用户在本轮消息中通过 @ 引用了以下工作区路径，请使用文件工具按需读取，不要猜测内容：',
    ...fileRefs.map((path) => `- ${path}`),
  ];
  return lines.join('\n');
}
