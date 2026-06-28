function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function formatReadLabel(inp: Record<string, unknown>): string {
  const path = inp.file_path ? String(inp.file_path) : '';
  const name = path ? basename(path) : 'file';
  const offset = typeof inp.offset === 'number' ? inp.offset : undefined;
  const limit = typeof inp.limit === 'number' ? inp.limit : undefined;

  if (offset !== undefined) {
    const start = offset + 1;
    if (limit !== undefined) {
      return `Read ${name} L${start}-${offset + limit}`;
    }
    return `Read ${name} L${start}`;
  }

  return path ? `Read ${name}` : 'Read';
}

function formatPathAction(action: string, inp: Record<string, unknown>): string {
  const path = inp.file_path ? String(inp.file_path) : '';
  return path ? `${action} ${basename(path)}` : action;
}

export function getToolActivityLabel(toolName: string, input: unknown): string {
  const inp = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  switch (toolName) {
    case 'Bash':
      return inp.command ? String(inp.command) : 'Bash';
    case 'Read':
      return formatReadLabel(inp);
    case 'Write':
      return formatPathAction('Write', inp);
    case 'Edit':
      return formatPathAction('Edit', inp);
    case 'Glob':
      return inp.pattern ? `Glob ${inp.pattern}` : 'Glob';
    case 'Grep':
      return inp.pattern ? `Grep ${inp.pattern}` : 'Grep';
    case 'WebFetch':
      return inp.url ? `WebFetch ${inp.url}` : 'WebFetch';
    case 'WebSearch':
      return inp.query ? `WebSearch ${inp.query}` : 'WebSearch';
    default:
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        return parts.length >= 3 ? `${parts[1]} ${parts[2]}` : toolName;
      }
      return toolName;
  }
}

export function summarizeCompletedTools(
  toolCalls: Array<{ toolName: string; input: unknown }>,
): string {
  const labels = toolCalls.map((t) => getToolActivityLabel(t.toolName, t.input));
  if (labels.length === 1) return labels[0];
  return labels.join('，');
}
