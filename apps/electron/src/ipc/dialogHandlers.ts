import { ipcMain, dialog, BrowserWindow } from 'electron';

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

  ipcMain.handle('dialog:confirm-path-access', async (event, options: { workspacePath: string; targetPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, response: 1 };

    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '路径访问请求',
      message: 'Agent 尝试访问工作区外的文件',
      detail: `目标路径：${options.targetPath}\n\n是否允许本次访问？`,
      buttons: ['允许本次', '始终允许', '拒绝'],
      defaultId: 2,
      cancelId: 2
    });

    return {
      success: true,
      response: result.response,
      alwaysAllow: result.response === 1
    };
  });
}
