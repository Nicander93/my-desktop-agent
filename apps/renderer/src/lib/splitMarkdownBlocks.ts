export interface MarkdownBlock {
  id: string;
  content: string;
  complete: boolean;
}

function isFenceLine(line: string): { marker: string } | null {
  const match = line.match(/^(`{3,}|~{3,})/);
  return match ? { marker: match[1] } : null;
}

function isClosingFence(line: string, marker: string): boolean {
  return line.startsWith(marker) && line.slice(marker.length).trim() === '';
}

export function splitMarkdownBlocks(content: string, isStreaming = false): MarkdownBlock[] {
  if (!content && !isStreaming) return [];

  const blocks: MarkdownBlock[] = [];
  let blockStart = 0;
  let i = 0;
  let inFence = false;
  let fenceMarker = '';
  let blockIdx = 0;

  const pushBlock = (end: number, complete: boolean) => {
    const text = content.slice(blockStart, end);
    if (text.length > 0 || (!complete && isStreaming)) {
      blocks.push({ id: `${blockIdx++}`, content: text, complete });
    }
    blockStart = end;
  };

  while (i < content.length) {
    const atLineStart = i === 0 || content[i - 1] === '\n';

    if (atLineStart) {
      const lineEnd = content.indexOf('\n', i);
      const lineEndPos = lineEnd === -1 ? content.length : lineEnd;
      const line = content.slice(i, lineEndPos);

      if (inFence) {
        if (isClosingFence(line, fenceMarker)) {
          i = lineEnd === -1 ? content.length : lineEnd + 1;
          pushBlock(i, true);
          inFence = false;
          fenceMarker = '';
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

    if (!inFence && content[i] === '\n' && i + 1 < content.length && content[i + 1] === '\n') {
      pushBlock(i + 2, true);
      i += 2;
      continue;
    }

    i++;
  }

  if (blockStart < content.length || (isStreaming && blockStart === content.length)) {
    pushBlock(content.length, !isStreaming);
  } else if (!isStreaming && content.length > 0 && blocks.length === 0) {
    pushBlock(content.length, true);
  }

  if (isStreaming && blocks.length === 0) {
    blocks.push({ id: '0', content: '', complete: false });
  }

  return blocks;
}
