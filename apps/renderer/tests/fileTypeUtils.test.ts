// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveEditorFileType, getLanguageFromPath } from '../src/lib/fileTypeUtils';

describe('fileTypeUtils', () => {
  it('resolves text from utf8 encoding', () => {
    expect(resolveEditorFileType('/a/b.txt', 'text/plain', 'utf8')).toBe('text');
  });

  it('resolves docx', () => {
    expect(
      resolveEditorFileType(
        'D:\\proj\\doc.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'base64'
      )
    ).toBe('docx');
  });

  it('resolves pptx', () => {
    expect(resolveEditorFileType('/a/slide.pptx', 'application/octet-stream', 'base64')).toBe('pptx');
  });

  it('resolves xlsx and pdf', () => {
    expect(resolveEditorFileType('/a/data.xlsx', 'application/octet-stream', 'base64')).toBe('xlsx');
    expect(resolveEditorFileType('/a/doc.pdf', 'application/pdf', 'base64')).toBe('pdf');
  });

  it('resolves image', () => {
    expect(resolveEditorFileType('/a/p.png', 'image/png', 'base64')).toBe('image');
  });

  it('maps file extension to monaco language', () => {
    expect(getLanguageFromPath('/a/b.ts')).toBe('typescript');
    expect(getLanguageFromPath('/a/c.yaml')).toBe('yaml');
    expect(getLanguageFromPath('/a/d.unknown')).toBe('plaintext');
  });
});
