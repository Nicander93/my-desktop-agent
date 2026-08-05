/**
 * 图片附件与消息引用类型；draft 未绑定消息，linked 已写入会话。
 * 二进制读写在 electron attachmentService，这里只有形状约定。
 */
export type ImageAttachmentStatus = "draft" | "linked";
/**
 * 附件文件服务可返回的原始图像或缩略图变体。
 */
export type ImageAttachmentVariant = "original" | "thumb";

/** 会话内图片附件元数据；不含实际字节 */
export interface ImageAttachment {
  id: string;
  conversationId: string;
  messageId?: string | null;
  status: ImageAttachmentStatus;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  fileName: string;
  size: number;
  width?: number | null;
  height?: number | null;
  createdAt: number;
}

/** 尚未发送、挂在输入框上的附件 */
export type AttachmentDraft = ImageAttachment & { status: "draft" };

/** 写入 Agent 消息体的轻量引用，由主进程解析为图片块 */
export interface AgentMessageAttachmentRef {
  id: string;
  kind: "image";
}

/** 从粘贴/拖拽字节创建 draft 时的输入 */
export interface CreateAttachmentFromBytesInput {
  conversationId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer | Uint8Array | number[];
}
