/** 目录项，readDir 与 stat 复用 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

/** 文件元信息 */
export interface FileStat {
  exists: boolean;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  ext: string;
}

/** 读文件结果 */
export interface ReadFileResult {
  content: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  size: number;
}

/** @ 引用搜索候选项 */
export interface FileSearchResult {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
}
