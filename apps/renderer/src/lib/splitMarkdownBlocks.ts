/**
 * 流式 Markdown 分块：fence 未闭合时整块标记 incomplete
 */
/** 可独立渲染的 Markdown 段；未完成块在流式状态下保留以避免 UI 抖动。 */
export interface MarkdownBlock {
  id: string;
  content: string;
  complete: boolean;
}

/** 识别代码围栏起始并保留 marker 类型，避免把反引号和波浪线混配闭合。 */
function isFenceLine(line: string): { marker: string } | null {
  const match = line.match(/^(`{3,}|~{3,})/);
  return match ? { marker: match[1] } : null;
}

/** 仅接受相同 marker 且无额外内容的围栏闭合行。 */
function isClosingFence(line: string, marker: string): boolean {
  return line.startsWith(marker) && line.slice(marker.length).trim() === "";
}

/**
 * 按空行与代码围栏切分 Markdown，供流式渲染增量复用稳定 block ID。
 *
 * 未闭合围栏在流式中作为 `complete: false` 保留，结束后才成为完整块。
 */
export function splitMarkdownBlocks(
  content: string,
  isStreaming = false,
): MarkdownBlock[] {
  if (!content && !isStreaming) return [];

  const blocks: MarkdownBlock[] = [];
  let blockStart = 0;
  let i = 0;
  let inFence = false;
  let fenceMarker = "";
  let blockIdx = 0;

  /** 写入非空块；流式末尾允许空未完成块作为占位节点。 */
  const pushBlock = (end: number, complete: boolean) => {
    const text = content.slice(blockStart, end);
    if (text.length > 0 || (!complete && isStreaming)) {
      blocks.push({ id: `${blockIdx++}`, content: text, complete });
    }
    blockStart = end;
  };

  while (i < content.length) {
    const atLineStart = i === 0 || content[i - 1] === "\n";

    if (atLineStart) {
      const lineEnd = content.indexOf("\n", i);
      const lineEndPos = lineEnd === -1 ? content.length : lineEnd;
      const line = content.slice(i, lineEndPos);

      if (inFence) {
        if (isClosingFence(line, fenceMarker)) {
          i = lineEnd === -1 ? content.length : lineEnd + 1;
          pushBlock(i, true);
          inFence = false;
          fenceMarker = "";
          continue;
        }
      } else {
        const fence = isFenceLine(line);
        if (fence) {
          if (blockStart < i) {
            pushBlock(i, true);
          }
          inFence = true;
          fenceMarker = fence.marker;
          i = lineEnd === -1 ? content.length : lineEnd + 1;
          continue;
        }
      }
    }

    if (
      !inFence &&
      content[i] === "\n" &&
      i + 1 < content.length &&
      content[i + 1] === "\n"
    ) {
      pushBlock(i + 2, true);
      i += 2;
      continue;
    }

    i++;
  }

  if (
    blockStart < content.length ||
    (isStreaming && blockStart === content.length)
  ) {
    pushBlock(content.length, !isStreaming);
  } else if (!isStreaming && content.length > 0 && blocks.length === 0) {
    pushBlock(content.length, true);
  }

  if (isStreaming && blocks.length === 0) {
    blocks.push({ id: "0", content: "", complete: false });
  }

  return blocks;
}
