/**
 * 图片附件存储与草稿管理
 *
 * 文件落在 userData/attachments；发送前 status 为 draft，link 后不可单独删
 */
import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  copyFileSync,
  writeFileSync,
} from "fs";
import { basename, extname, join } from "path";
import { v4 as uuidv4 } from "uuid";
import { getDatabase, saveDatabase } from "../db";
import type {
  AgentMessageAttachmentRef,
  ImageAttachment,
} from "@desktop-agent/shared";

/**
 * 当前允许落盘并发送给模型的图片 MIME 类型。
 *
 * 新增格式时必须同步检查预览、Provider 多模态转换和大小限制。
 */
type SupportedMimeType = ImageAttachment["mimeType"];

/**
 * 附件表的内部行结构，额外包含不暴露给 renderer 的绝对 storagePath。
 */
interface AttachmentRow extends ImageAttachment {
  storagePath: string;
  updatedAt: number;
}

/**
 * 单条消息允许的最大图片数，防止多模态请求和本地编码占用无上限增长。
 */
export const MAX_IMAGE_ATTACHMENTS = 4;
/**
 * 单张图片的落盘与发送上限（字节）。
 *
 * 上限在读取整个文件前检查，避免用户选择超大图片导致主进程内存峰值过高。
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 文件扩展名到允许 MIME 类型的保守映射。
 *
 * 扩展名只是 fallback；实际类型仍需由文件魔数验证，不能信任用户文件名。
 */
const MIME_BY_EXT: Record<string, SupportedMimeType | undefined> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * 执行返回多行的参数化查询并及时释放 sql.js statement。
 *
 * 显式释放避免附件列表频繁查询时在主进程长期累积原生资源。
 */
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

/**
 * 返回参数化查询的第一行，用于按主键查询。
 */
function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

/**
 * 返回所有附件的受控根目录，避免将 renderer 传入的路径直接用于落盘。
 */
function attachmentsRoot(): string {
  return join(app.getPath("userData"), "attachments");
}

/**
 * 为已验证的 MIME 类型选择稳定的存储扩展名。
 */
function extensionForMime(mimeType: SupportedMimeType): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

/**
 * 规范化展示文件名，移除 Windows 非法字符与路径片段。
 *
 * 存储位置使用生成的 ID；文件名仅供 UI 显示，仍需防止其影响路径语义。
 */
function normalizeFileName(
  fileName: string,
  mimeType: SupportedMimeType,
): string {
  const base = basename(
    fileName || `image${extensionForMime(mimeType)}`,
  ).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return base || `image${extensionForMime(mimeType)}`;
}

/**
 * 根据文件魔数确认允许的图片类型，并仅在无法识别时回退到声明类型。
 *
 * 不能仅信任扩展名或 renderer 声明，否则可将非图片内容伪装为多模态附件写入。
 */
function detectMime(
  buffer: Buffer,
  fallback?: string,
): SupportedMimeType | null {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return isSupportedMime(fallback) ? fallback : null;
}

/**
 * 判断字符串是否属于当前附件协议允许的图片 MIME 类型。
 */
function isSupportedMime(mimeType?: string): mimeType is SupportedMimeType {
  return (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
  );
}

/**
 * 从数据库行剥离主进程私有的绝对存储路径后返回给 renderer。
 */
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

/**
 * 读取附件原始记录，仅供主进程在校验归属与读取文件前使用。
 */
function rowById(id: string): AttachmentRow | undefined {
  return queryOne<AttachmentRow>("SELECT * FROM attachments WHERE id = ?", [
    id,
  ]);
}

/**
 * 将已在内存中的图片创建为草稿附件并同步写入数据库。
 *
 * 文件和记录必须一并完成，发送前可以通过 `draft` 状态安全清理未引用内容。
 */
function createDraftFromBuffer(
  conversationId: string,
  fileName: string,
  declaredMimeType: string | undefined,
  buffer: Buffer,
): ImageAttachment {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 10MB");
  }

  const mimeType = detectMime(buffer, declaredMimeType);
  if (!mimeType) {
    throw new Error("仅支持 PNG、JPG、WEBP 图片");
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
    [
      id,
      conversationId,
      mimeType,
      safeName,
      storagePath,
      buffer.length,
      now,
      now,
    ],
  );
  saveDatabase();

  return {
    id,
    conversationId,
    messageId: null,
    status: "draft",
    mimeType,
    fileName: safeName,
    size: buffer.length,
    width: null,
    height: null,
    createdAt: now,
  };
}

/**
 * 从 renderer 粘贴的字节创建草稿附件。
 *
 * 输入字节在主进程转换为 Buffer 后统一经过大小和魔数校验，避免 IPC 两条入口行为不一致。
 */
export function createDraftFromBytes(input: {
  conversationId: string;
  fileName: string;
  mimeType?: string;
  bytes: ArrayBuffer | Uint8Array | number[];
}): ImageAttachment {
  const buffer = Buffer.from(input.bytes as Uint8Array);
  return createDraftFromBuffer(
    input.conversationId,
    input.fileName,
    input.mimeType,
    buffer,
  );
}

/**
 * 从用户选择的本地路径复制为草稿附件。
 *
 * 先检查文件大小和图片魔数，再复制到受控目录，原文件随后可被用户移动或删除而不影响会话记录。
 */
export function createDraftFromPath(
  conversationId: string,
  filePath: string,
): ImageAttachment {
  if (!existsSync(filePath)) {
    throw new Error("图片文件不存在");
  }
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error("请选择图片文件");
  }
  if (stats.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 10MB");
  }

  const buffer = readFileSync(filePath);
  const extMime = MIME_BY_EXT[extname(filePath).toLowerCase()];
  const mimeType = detectMime(buffer, extMime);
  if (!mimeType) {
    throw new Error("仅支持 PNG、JPG、WEBP 图片");
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
    status: "draft",
    mimeType,
    fileName: safeName,
    size: stats.size,
    width: null,
    height: null,
    createdAt: now,
  };
}

/**
 * 读取原图并返回 data URL，供 renderer 预览。
 *
 * 此处只接受附件 ID，不暴露任意本地路径读取能力。
 */
export function getPreviewUrl(id: string): string {
  const row = rowById(id);
  if (!row) {
    throw new Error("附件不存在");
  }
  if (!existsSync(row.storagePath)) {
    throw new Error("附件文件不存在");
  }
  const data = readFileSync(row.storagePath).toString("base64");
  return `data:${row.mimeType};base64,${data}`;
}

/**
 * 删除未发送的草稿附件及其磁盘目录。
 *
 * `linked` 附件属于已保存消息，禁止单独删除以保证历史会话可重放。
 */
export function deleteDraft(id: string): boolean {
  const row = rowById(id);
  if (!row) {
    throw new Error("附件不存在");
  }
  if (row.status !== "draft") {
    throw new Error("已发送的图片不能单独删除");
  }

  const db = getDatabase();
  db.run("DELETE FROM attachments WHERE id = ?", [id]);
  saveDatabase();

  const dir = join(attachmentsRoot(), row.conversationId, row.id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

/**
 * 在发送前校验附件引用归属和文件存在性，并返回仅供主进程编码的存储路径。
 *
 * 会话 ID 参与校验，防止 renderer 用其他会话的附件 ID 越权引用图片。
 */
export function getAttachmentsForMessage(
  refs: AgentMessageAttachmentRef[],
  conversationId: string,
): Array<ImageAttachment & { storagePath: string }> {
  if (refs.length > MAX_IMAGE_ATTACHMENTS) {
    throw new Error(`一次最多发送 ${MAX_IMAGE_ATTACHMENTS} 张图片`);
  }

  return refs.map((ref) => {
    const row = rowById(ref.id);
    if (!row || row.conversationId !== conversationId || ref.kind !== "image") {
      throw new Error("图片附件不存在或不属于当前对话");
    }
    if (!existsSync(row.storagePath)) {
      throw new Error("图片附件文件不存在");
    }
    return { ...publicAttachment(row), storagePath: row.storagePath };
  });
}

/**
 * 在消息落库后将草稿附件绑定为 `linked`。
 *
 * 状态迁移不可逆，使清理草稿不会误删已经提交到会话历史的图片。
 */
export function linkAttachments(
  refs: AgentMessageAttachmentRef[],
  conversationId: string,
  messageId: string,
): ImageAttachment[] {
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
    status: "linked",
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    size: attachment.size,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    createdAt: attachment.createdAt,
  }));
}

/**
 * 读取经前置校验的附件原图 Base64，供 Provider 多模态消息组装。
 */
export function readAttachmentBase64(attachment: {
  storagePath: string;
}): string {
  return readFileSync(attachment.storagePath).toString("base64");
}
