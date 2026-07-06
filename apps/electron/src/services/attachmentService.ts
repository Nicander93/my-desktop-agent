import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, copyFileSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../db';
import type { AgentMessageAttachmentRef, ImageAttachment } from '@desktop-agent/shared';

type SupportedMimeType = ImageAttachment['mimeType'];

interface AttachmentRow extends ImageAttachment {
  storagePath: string;
  updatedAt: number;
}

export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT: Record<string, SupportedMimeType | undefined> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

function attachmentsRoot(): string {
  return join(app.getPath('userData'), 'attachments');
}

function extensionForMime(mimeType: SupportedMimeType): string {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  return '.png';
}

function normalizeFileName(fileName: string, mimeType: SupportedMimeType): string {
  const base = basename(fileName || `image${extensionForMime(mimeType)}`).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return base || `image${extensionForMime(mimeType)}`;
}

function detectMime(buffer: Buffer, fallback?: string): SupportedMimeType | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return isSupportedMime(fallback) ? fallback : null;
}

function isSupportedMime(mimeType?: string): mimeType is SupportedMimeType {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
}

function publicAttachment(row: AttachmentRow): ImageAttachment {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId ?? null,
    status: row.status,
    mimeType: row.mimeType,
    fileName: row.fileName,
    size: row.size,
    width: row.width ?? null,
    height: row.height ?? null,
    createdAt: row.createdAt,
  };
}

function rowById(id: string): AttachmentRow | undefined {
  return queryOne<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', [id]);
}

function createDraftFromBuffer(
  conversationId: string,
  fileName: string,
  declaredMimeType: string | undefined,
  buffer: Buffer,
): ImageAttachment {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('图片不能超过 10MB');
  }

  const mimeType = detectMime(buffer, declaredMimeType);
  if (!mimeType) {
    throw new Error('仅支持 PNG、JPG、WEBP 图片');
  }

  const id = uuidv4();
  const now = Date.now();
  const safeName = normalizeFileName(fileName, mimeType);
  const dir = join(attachmentsRoot(), conversationId, id);
  const storagePath = join(dir, `original${extensionForMime(mimeType)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(storagePath, buffer);

  const db = getDatabase();
  db.run(
    `INSERT INTO attachments (id, conversationId, messageId, status, mimeType, fileName, storagePath, size, width, height, createdAt, updatedAt)
     VALUES (?, ?, NULL, 'draft', ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [id, conversationId, mimeType, safeName, storagePath, buffer.length, now, now],
  );
  saveDatabase();

  return {
    id,
    conversationId,
    messageId: null,
    status: 'draft',
    mimeType,
    fileName: safeName,
    size: buffer.length,
    width: null,
    height: null,
    createdAt: now,
  };
}

export function createDraftFromBytes(input: {
  conversationId: string;
  fileName: string;
  mimeType?: string;
  bytes: ArrayBuffer | Uint8Array | number[];
}): ImageAttachment {
  const buffer = Buffer.from(input.bytes as Uint8Array);
  return createDraftFromBuffer(input.conversationId, input.fileName, input.mimeType, buffer);
}

export function createDraftFromPath(conversationId: string, filePath: string): ImageAttachment {
  if (!existsSync(filePath)) {
    throw new Error('图片文件不存在');
  }
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error('请选择图片文件');
  }
  if (stats.size > MAX_IMAGE_BYTES) {
    throw new Error('图片不能超过 10MB');
  }

  const buffer = readFileSync(filePath);
  const extMime = MIME_BY_EXT[extname(filePath).toLowerCase()];
  const mimeType = detectMime(buffer, extMime);
  if (!mimeType) {
    throw new Error('仅支持 PNG、JPG、WEBP 图片');
  }

  const id = uuidv4();
  const now = Date.now();
  const safeName = normalizeFileName(basename(filePath), mimeType);
  const dir = join(attachmentsRoot(), conversationId, id);
  const storagePath = join(dir, `original${extensionForMime(mimeType)}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(filePath, storagePath);

  const db = getDatabase();
  db.run(
    `INSERT INTO attachments (id, conversationId, messageId, status, mimeType, fileName, storagePath, size, width, height, createdAt, updatedAt)
     VALUES (?, ?, NULL, 'draft', ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [id, conversationId, mimeType, safeName, storagePath, stats.size, now, now],
  );
  saveDatabase();

  return {
    id,
    conversationId,
    messageId: null,
    status: 'draft',
    mimeType,
    fileName: safeName,
    size: stats.size,
    width: null,
    height: null,
    createdAt: now,
  };
}

export function getPreviewUrl(id: string): string {
  const row = rowById(id);
  if (!row) {
    throw new Error('附件不存在');
  }
  if (!existsSync(row.storagePath)) {
    throw new Error('附件文件不存在');
  }
  const data = readFileSync(row.storagePath).toString('base64');
  return `data:${row.mimeType};base64,${data}`;
}

export function deleteDraft(id: string): boolean {
  const row = rowById(id);
  if (!row) {
    throw new Error('附件不存在');
  }
  if (row.status !== 'draft') {
    throw new Error('已发送的图片不能单独删除');
  }

  const db = getDatabase();
  db.run('DELETE FROM attachments WHERE id = ?', [id]);
  saveDatabase();

  const dir = join(attachmentsRoot(), row.conversationId, row.id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

export function getAttachmentsForMessage(
  refs: AgentMessageAttachmentRef[],
  conversationId: string,
): Array<ImageAttachment & { storagePath: string }> {
  if (refs.length > MAX_IMAGE_ATTACHMENTS) {
    throw new Error(`一次最多发送 ${MAX_IMAGE_ATTACHMENTS} 张图片`);
  }

  return refs.map((ref) => {
    const row = rowById(ref.id);
    if (!row || row.conversationId !== conversationId || ref.kind !== 'image') {
      throw new Error('图片附件不存在或不属于当前对话');
    }
    if (!existsSync(row.storagePath)) {
      throw new Error('图片附件文件不存在');
    }
    return { ...publicAttachment(row), storagePath: row.storagePath };
  });
}

export function linkAttachments(refs: AgentMessageAttachmentRef[], conversationId: string, messageId: string): ImageAttachment[] {
  if (refs.length === 0) return [];
  const attachments = getAttachmentsForMessage(refs, conversationId);
  const now = Date.now();
  const db = getDatabase();
  for (const attachment of attachments) {
    db.run(
      `UPDATE attachments SET status = 'linked', messageId = ?, updatedAt = ? WHERE id = ?`,
      [messageId, now, attachment.id],
    );
  }
  saveDatabase();
  return attachments.map((attachment) => ({
    id: attachment.id,
    conversationId: attachment.conversationId,
    messageId,
    status: 'linked',
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    size: attachment.size,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    createdAt: attachment.createdAt,
  }));
}

export function readAttachmentBase64(attachment: { storagePath: string }): string {
  return readFileSync(attachment.storagePath).toString('base64');
}
