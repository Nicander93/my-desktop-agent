/**
 * 工作区相关 IPC Handler
 *
 */
import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as workspaceService from '../services/workspaceService';

/** 注册所有 workspace:* IPC 通道 */
export function registerWorkspaceHandlers(): void {
  /** 创建工作区：弹窗选目录后写入数据库 */
  ipcMain.handle('workspace:create', async (event, name: string, description?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'Window not found' };

    const result = await dialog.showOpenDialog(window, {
      title: '选择工作目录',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '用户取消选择' };
    }

    const path = result.filePaths[0];
    const existing = workspaceService.getWorkspaceByPath(path);
    if (existing) {
      return { success: false, error: '该目录已被添加为工作区' };
    }

    const workspace = workspaceService.createWorkspace(name, path, description);
    return { success: true, workspace };
  });

  /** 已知路径直接创建，供 CreateWorkspaceDialog 使用 */
  ipcMain.handle('workspace:create-from-path', (_, name: string, path: string, description?: string) => {
    const existing = workspaceService.getWorkspaceByPath(path);
    if (existing) {
      return { success: false, error: '该目录已被添加为工作区' };
    }
    const workspace = workspaceService.createWorkspace(name, path, description);
    return { success: true, workspace };
  });

  ipcMain.handle('workspace:get-all', () => {
    const workspaces = workspaceService.getAllWorkspaces();
    return { success: true, workspaces };
  });

  ipcMain.handle('workspace:get', (_, id: string) => {
    const workspace = workspaceService.getWorkspace(id);
    if (!workspace) return { success: false, error: '工作区不存在' };
    return { success: true, workspace };
  });

  ipcMain.handle('workspace:update', (_, id: string, updates: { name?: string; description?: string; icon?: string; color?: string }) => {
    const workspace = workspaceService.updateWorkspace(id, updates);
    if (!workspace) return { success: false, error: '工作区不存在' };
    return { success: true, workspace };
  });

  ipcMain.handle('workspace:delete', (_, id: string) => {
    const success = workspaceService.deleteWorkspace(id);
    return { success };
  });

  /** 更新最近访问时间 */
  ipcMain.handle('workspace:touch', (_, id: string) => {
    workspaceService.touchWorkspace(id);
    return { success: true };
  });

  ipcMain.handle('workspace:get-settings', (_, workspaceId: string) => {
    const settings = workspaceService.getWorkspaceSettings(workspaceId);
    return { success: true, settings };
  });

  ipcMain.handle('workspace:update-settings', (_, workspaceId: string, settings: { allowedPaths?: string[]; restrictedMode?: boolean }) => {
    workspaceService.updateWorkspaceSettings(workspaceId, settings);
    return { success: true };
  });
}
