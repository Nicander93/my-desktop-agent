/**
 * 路径访问守卫
 *
 * Agent 工具访问文件路径时的检查逻辑：
 * 1. 工作区未开启 restrictedMode → 直接放行
 * 2. 路径在工作区或 allowedPaths 内 → 放行
 * 3. 路径在「始终允许」内存白名单 → 放行
 * 4. 否则弹窗让用户选择
 */
import { BrowserWindow, dialog } from 'electron';
import * as workspaceService from './workspaceService';

/** 路径访问检查请求 */
export interface PathAccessRequest {
  workspaceId: string;
  targetPath: string;
  toolName: string;
}

export interface PathAccessResult {
  allowed: boolean;
  alwaysAllow?: boolean;
}

/** 用户选择「始终允许」后，按工作区缓存的路径白名单（进程内有效） */
const alwaysAllowedPaths = new Map<string, Set<string>>();

/** 将路径加入工作区的始终允许白名单 */
export function grantAlwaysAllow(workspaceId: string, path: string): void {
  if (!alwaysAllowedPaths.has(workspaceId)) {
    alwaysAllowedPaths.set(workspaceId, new Set());
  }
  alwaysAllowedPaths.get(workspaceId)!.add(path);
}

/**
 * 弹出路径访问确认对话框
 * 返回：允许本次 / 始终允许 / 拒绝
 */
export async function showPathAccessDialog(
  window: BrowserWindow | null,
  options: { workspacePath: string; targetPath: string; toolName?: string }
): Promise<{ allowed: boolean; alwaysAllow?: boolean }> {
  if (!window) return { allowed: false };

  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    title: '路径访问请求',
    message: 'Agent 尝试访问工作区外的文件',
    detail: [
      options.toolName ? `工具：${options.toolName}` : null,
      `工作区：${options.workspacePath}`,
      `目标路径：${options.targetPath}`,
      '',
      '是否允许本次访问？'
    ].filter(Boolean).join('\n'),
    buttons: ['允许本次', '始终允许', '拒绝'],
    defaultId: 2,
    cancelId: 2
  });

  if (result.response === 2) return { allowed: false };
  if (result.response === 1) return { allowed: true, alwaysAllow: true };
  return { allowed: true };
}

/**
 * 检查 Agent 是否允许访问目标路径
 * 工作区外路径需用户确认
 */
export async function checkPathAccess(
  request: PathAccessRequest,
  window: BrowserWindow | null
): Promise<PathAccessResult> {
  const workspace = workspaceService.getWorkspace(request.workspaceId);
  if (!workspace) return { allowed: false };

  const settings = workspaceService.getWorkspaceSettings(request.workspaceId);
  // 未开启限制模式时直接放行
  if (settings && !settings.restrictedMode) return { allowed: true };

  const isWithinWorkspace = workspaceService.isPathInWorkspace(
    workspace.path, request.targetPath, settings?.allowedPaths
  );
  if (isWithinWorkspace) return { allowed: true };

  // 检查「始终允许」白名单
  const workspaceAllowed = alwaysAllowedPaths.get(request.workspaceId);
  if (workspaceAllowed) {
    for (const allowedPath of workspaceAllowed) {
      if (request.targetPath.startsWith(allowedPath) || request.targetPath === allowedPath) {
        return { allowed: true };
      }
    }
  }

  const dialogResult = await showPathAccessDialog(window, {
    workspacePath: workspace.path,
    targetPath: request.targetPath,
    toolName: request.toolName
  });

  if (!dialogResult.allowed) return { allowed: false };
  if (dialogResult.alwaysAllow) {
    grantAlwaysAllow(request.workspaceId, request.targetPath);
    return { allowed: true, alwaysAllow: true };
  }
  return { allowed: true };
}
