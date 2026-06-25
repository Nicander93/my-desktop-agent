/** 工具 input 中可能包含路径的字段名 */
const PATH_KEYS = ['path', 'cwd', 'destination', 'file_path', 'filePath', 'target', 'source', 'from', 'to', 'directory', 'dir'];

/**
 * 从工具调用参数中提取所有路径字符串
 * 用于路径访问守卫检查 Agent 是否越界访问文件
 */
export function extractPathsFromToolInput(_toolName: string, input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const record = input as Record<string, unknown>;
  const paths: string[] = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      paths.push(value);
    }
  }
  return paths;
}
