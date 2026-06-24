import { BrowserWindow } from 'electron';
import * as workspaceService from './workspaceService';

export interface PathAccessRequest {
  workspaceId: string;
  targetPath: string;
  toolName: string;
}

export interface PathAccessResult {
  allowed: boolean;
  alwaysAllow?: boolean;
}

const alwaysAllowedPaths = new Map<string, Set<string>>();

export async function checkPathAccess(
  request: PathAccessRequest,
  window: BrowserWindow | null
): Promise<PathAccessResult> {
  const workspace = workspaceService.getWorkspace(request.workspaceId);
  if (!workspace) return { allowed: false };

  const settings = workspaceService.getWorkspaceSettings(request.workspaceId);
  if (settings && !settings.restrictedMode) return { allowed: true };

  const isWithinWorkspace = workspaceService.isPathInWorkspace(
    workspace.path, request.targetPath, settings?.allowedPaths
  );
  if (isWithinWorkspace) return { allowed: true };

  const workspaceAllowed = alwaysAllowedPaths.get(request.workspaceId);
  if (workspaceAllowed) {
    for (const allowedPath of workspaceAllowed) {
      if (request.targetPath.startsWith(allowedPath) || request.targetPath === allowedPath) {
        return { allowed: true };
      }
    }
  }

  if (!window) return { allowed: false };

  try {
    const response = await window.webContents.send('agent:path-access-request', {
      workspacePath: workspace.path,
      targetPath: request.targetPath
    });

    const result = await new Promise<PathAccessResult>((resolve) => {
      ipcMain.once('agent:path-access-response', (_, data: { allowed: boolean; alwaysAllow: boolean }) => {
        resolve(data);
      });
      setTimeout(() => resolve({ allowed: false }), 30000);
    });

    return result;
  } catch {
    return { allowed: false };
  }
}

import { ipcMain } from 'electron';

export function grantAlwaysAllow(workspaceId: string, path: string): void {
  if (!alwaysAllowedPaths.has(workspaceId)) {
    alwaysAllowedPaths.set(workspaceId, new Set());
  }
  alwaysAllowedPaths.get(workspaceId)!.add(path);
}
