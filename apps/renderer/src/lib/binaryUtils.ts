/**
 * base64 与 ArrayBuffer/Blob 互转，供 Office/PDF 预览
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** base64 转带 MIME 的 Blob */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const buffer = base64ToArrayBuffer(base64);
  return new Blob([buffer], { type: mimeType });
}
