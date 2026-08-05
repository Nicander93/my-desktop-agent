/**
 * workspace-preview:// 协议 — 为 HTML 预览 iframe 提供本地工作区文件访问
 */
import { existsSync } from "fs";
import { net, protocol, type BrowserWindow } from "electron";
import { pathToFileURL } from "url";
import { checkPathAccess } from "./pathGuard";

/**
 * 用于受控暴露工作区文件给 HTML 预览的自定义协议名。
 */
const SCHEME = "workspace-preview";

/**
 * 在应用准备阶段声明预览协议所需的安全权限。
 */
export function registerWorkspacePreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * 为指定工作区文件生成协议 URL，使 renderer 无需直接持有 file:// 访问权。
 */
export function buildWorkspacePreviewUrl(
  workspaceId: string,
  filePath: string,
): string {
  const encodedPath = encodeURIComponent(filePath);
  return `${SCHEME}://open/${workspaceId}/${encodedPath}`;
}

/**
 * 解析并校验预览请求 URL；格式不完整或编码无效时返回空值。
 */
function parsePreviewRequestUrl(
  requestUrl: string,
): { workspaceId: string; filePath: string } | null {
  try {
    const url = new URL(requestUrl);
    if (url.hostname !== "open") return null;

    const segments = url.pathname.slice(1).split("/");
    if (segments.length < 2) return null;

    const workspaceId = segments[0];
    const encodedPath = segments.slice(1).join("/");
    const filePath = decodeURIComponent(encodedPath);
    if (!workspaceId || !filePath) return null;

    return { workspaceId, filePath };
  } catch {
    return null;
  }
}

/**
 * 复用 Agent 的路径授权规则，确认当前窗口可预览目标文件。
 */
export async function assertPreviewAccess(
  workspaceId: string,
  filePath: string,
  window: BrowserWindow | null,
): Promise<void> {
  const result = await checkPathAccess(
    { workspaceId, targetPath: filePath, toolName: "html-preview" },
    window,
  );
  if (!result.allowed) {
    throw new Error("路径访问被拒绝");
  }
}

/**
 * 注册协议请求处理器：先验证 URL 和工作区授权，再交由 Electron 流式读取文件。
 */
export function registerWorkspacePreviewProtocol(
  getWindow: () => BrowserWindow | null,
): void {
  protocol.handle(SCHEME, async (request) => {
    const parsed = parsePreviewRequestUrl(request.url);
    if (!parsed) {
      return new Response("Invalid preview URL", { status: 400 });
    }

    const { workspaceId, filePath } = parsed;

    try {
      await assertPreviewAccess(workspaceId, filePath, getWindow());
    } catch {
      return new Response("Forbidden", { status: 403 });
    }

    if (!existsSync(filePath)) {
      return new Response("Not Found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).href);
  });
}
