import type { EditorFileType } from '@/stores/editorStore';

function getExtFromPath(path: string): string {
  const name = path.split(/[/\\]/).pop() || path;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    if (name.startsWith('.') && name.length > 1) return name.slice(1).toLowerCase();
    return '';
  }
  return name.slice(dot + 1).toLowerCase();
}

export function resolveEditorFileType(
  path: string,
  mimeType: string,
  encoding: 'utf8' | 'base64'
): EditorFileType {
  const ext = getExtFromPath(path);
  if (ext === 'html' || ext === 'htm') return 'html';
  if (encoding === 'utf8') return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (ext === 'docx') return 'docx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  return 'binary';
}

const EXT_TO_MONACO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  vue: 'html',
  toml: 'ini',
  ini: 'ini',
  env: 'ini',
  gitignore: 'plaintext',
  dockerignore: 'plaintext',
  editorconfig: 'ini',
};

export function getLanguageFromPath(path: string): string {
  const ext = getExtFromPath(path);
  if (!ext) return 'plaintext';
  return EXT_TO_MONACO_LANG[ext] ?? 'plaintext';
}
