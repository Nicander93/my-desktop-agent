/**
 * 工作区文件系统 IPC Handler
 */
import { ipcMain, BrowserWindow } from "electron";
import * as fileService from "../services/fileService";
import {
  assertPreviewAccess,
  buildWorkspacePreviewUrl,
} from "../services/workspacePreviewProtocol";

/**
 * 注册受工作区边界保护的文件系统 IPC 通道。
 *
 * 每次调用均根据发送方 WebContents 解析窗口，令服务层可以将用户授权与实际 renderer 请求绑定。
 */
export function registerFileHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    "workspace-fs:stat",
    async (event, workspaceId: string, path: string) => {
      try {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        const stat = await fileService.statFile(workspaceId, path, window);
        return { success: true, stat };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "workspace-fs:read",
    async (event, workspaceId: string, path: string) => {
      try {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        const file = await fileService.readFile(workspaceId, path, window);
        return { success: true, file };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "workspace-fs:write",
    async (event, workspaceId: string, path: string, content: string) => {
      try {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        await fileService.writeFile(workspaceId, path, content, window);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "workspace-fs:read-dir",
    async (event, workspaceId: string, dirPath: string) => {
      try {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        const entries = await fileService.readDir(workspaceId, dirPath, window);
        return { success: true, entries };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "workspace-fs:search",
    async (event, workspaceId: string, query: string) => {
      try {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        const results = await fileService.searchFiles(
          workspaceId,
          query,
          window,
        );
        return { success: true, results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "workspace-fs:get-preview-url",
    async (event, workspaceId: string, path: string) => {
      try {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        await assertPreviewAccess(workspaceId, path, window);
        return {
          success: true,
          url: buildWorkspacePreviewUrl(workspaceId, path),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );
}
