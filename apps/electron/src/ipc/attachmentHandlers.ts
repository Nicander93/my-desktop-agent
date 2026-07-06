import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron';
import type { CreateAttachmentFromBytesInput, ImageAttachmentVariant } from '@desktop-agent/shared';
import {
  createDraftFromBytes,
  createDraftFromPath,
  deleteDraft,
  getPreviewUrl,
  MAX_IMAGE_ATTACHMENTS,
} from '../services/attachmentService';

export function registerAttachmentHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('attachment:select-images', async (_, conversationId: string) => {
    try {
      const options: OpenDialogOptions = {
        title: '选择图片',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      };
      const window = getMainWindow();
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled) {
        return { success: true, canceled: true, attachments: [] };
      }
      if (result.filePaths.length > MAX_IMAGE_ATTACHMENTS) {
        return { success: false, error: `一次最多发送 ${MAX_IMAGE_ATTACHMENTS} 张图片` };
      }

      const attachments = result.filePaths.map((filePath) => createDraftFromPath(conversationId, filePath));
      return { success: true, canceled: false, attachments };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '选择图片失败' };
    }
  });

  ipcMain.handle('attachment:create-from-bytes', async (_, input: CreateAttachmentFromBytesInput) => {
    try {
      const attachment = createDraftFromBytes(input);
      return { success: true, attachment };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '保存图片失败' };
    }
  });

  ipcMain.handle('attachment:get-preview-url', async (_, id: string, _variant?: ImageAttachmentVariant) => {
    try {
      const url = getPreviewUrl(id);
      return { success: true, url };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取图片失败' };
    }
  });

  ipcMain.handle('attachment:delete-draft', async (_, id: string) => {
    try {
      deleteDraft(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除图片失败' };
    }
  });
}
