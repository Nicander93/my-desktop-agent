/**
 * 系统对话框 IPC Handler
 *
 * 提供目录选择和路径访问确认，复用 pathGuard 的弹窗逻辑
 */
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { showPathAccessDialog } from '../services/pathGuard';

/** 注册 dialog:* IPC 通道 */
export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:select-directory', async (event, options?: { title?: string; defaultPath?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'Window not found' };

    const result = await dialog.showOpenDialog(window, {
      title: options?.title || '选择目录',
      defaultPath: options?.defaultPath,
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('dialog:confirm-path-access', async (event, options: { workspacePath: string; targetPath: string; toolName?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, response: 2 };

    const result = await showPathAccessDialog(window, options);

    return {
      success: true,
      response: result.allowed ? (result.alwaysAllow ? 1 : 0) : 2,
      alwaysAllow: result.alwaysAllow
    };
  });
}
