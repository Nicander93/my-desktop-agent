export function getToolActivityLabel(toolName: string, input: unknown): string {
  const inp = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  switch (toolName) {
    case 'Bash':
      return inp.command ? String(inp.command) : '执行命令';
    case 'Read':
      return inp.file_path ? `读取 ${inp.file_path}` : '读取文件';
    case 'Write':
      return inp.file_path ? `写入 ${inp.file_path}` : '写入文件';
    case 'Edit':
      return inp.file_path ? `编辑 ${inp.file_path}` : '编辑文件';
    case 'Glob':
      return inp.pattern ? `搜索文件 ${inp.pattern}` : '搜索文件';
    case 'Grep':
      return inp.pattern ? `搜索内容 ${inp.pattern}` : '搜索内容';
    case 'WebFetch':
      return inp.url ? `获取 ${inp.url}` : '获取网页';
    case 'WebSearch':
      return inp.query ? `搜索 ${inp.query}` : '网络搜索';
    default:
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
