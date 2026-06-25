export type TextSegment = { type: 'text'; value: string } | { type: 'path'; value: string };

/** 匹配 Windows / Unix 带扩展名的文件路径 */
export const FILE_PATH_REGEX =
  /(?:[A-Za-z]:[/\\]|\/)(?:[^\s<>"'|:*?]+[/\\])*[^\s<>"'|:*?]+\.[a-zA-Z0-9]+/g;

export function splitTextWithFilePaths(text: string): TextSegment[] {
  if (!text) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(FILE_PATH_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'path', value: match[0] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
