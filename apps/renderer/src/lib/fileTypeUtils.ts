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
  if (encoding === 'utf8') return 'text';

  const ext = getExtFromPath(path);
  if (mimeType.startsWith('image/')) return 'image';
  if (ext === 'docx') return 'docx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  return 'binary';
}
