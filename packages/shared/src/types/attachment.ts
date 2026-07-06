export type ImageAttachmentStatus = 'draft' | 'linked';
export type ImageAttachmentVariant = 'original' | 'thumb';

export interface ImageAttachment {
  id: string;
  conversationId: string;
  messageId?: string | null;
  status: ImageAttachmentStatus;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileName: string;
  size: number;
  width?: number | null;
  height?: number | null;
  createdAt: number;
}

export type AttachmentDraft = ImageAttachment & { status: 'draft' };

export interface AgentMessageAttachmentRef {
  id: string;
  kind: 'image';
}

export interface CreateAttachmentFromBytesInput {
  conversationId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer | Uint8Array | number[];
}
