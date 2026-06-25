/**
 * Agent 路径拦截器
 *
 * 在工具执行前检查路径是否在工作区允许范围内
 */
import { AgentRuntime } from '@desktop-agent/agent-runtime';
import { BrowserWindow } from 'electron';
import { checkPathAccess } from './pathGuard';

/**
 * 为 AgentRuntime 注册路径访问检查器
 * @param getWindow 延迟获取主窗口，用于弹出确认对话框
 */
export function setupPathInterceptor(
  runtime: AgentRuntime,
  getWindow: () => BrowserWindow | null
): void {
  runtime.setPathAccessChecker(async (request) => {
    const result = await checkPathAccess(
      {
        workspaceId: request.workspaceId,
        targetPath: request.targetPath,
        toolName: request.toolName
      },
      getWindow()
    );
    return { allowed: result.allowed };
  });
}
