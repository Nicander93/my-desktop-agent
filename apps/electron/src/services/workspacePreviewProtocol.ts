/**
 * workspace-preview:// 协议 — 为 HTML 预览 iframe 提供本地工作区文件访问
 */
import { existsSync } from 'fs';
import { net, protocol, type BrowserWindow } from 'electron';
import { pathToFileURL } from 'url';
import { checkPathAccess } from './pathGuard';

const SCHEME = 'workspace-preview';

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

export function buildWorkspacePreviewUrl(workspaceId: string, filePath: string): string {
  const encodedPath = encodeURIComponent(filePath);
  return `${SCHEME}://open/${workspaceId}/${encodedPath}`;
}

function parsePreviewRequestUrl(requestUrl: string): { workspaceId: string; filePath: string } | null {
  try {
    const url = new URL(requestUrl);
    if (url.hostname !== 'open') return null;

    const segments = url.pathname.slice(1).split('/');
    if (segments.length < 2) return null;

    const workspaceId = segments[0];
    const encodedPath = segments.slice(1).join('/');
    const filePath = decodeURIComponent(encodedPath);
    if (!workspaceId || !filePath) return null;

    return { workspaceId, filePath };
  } catch {
    return null;
  }
}

export async function assertPreviewAccess(
  workspaceId: string,
  filePath: string,
  window: BrowserWindow | null,
): Promise<void> {
  const result = await checkPathAccess(
    { workspaceId, targetPath: filePath, toolName: 'html-preview' },
    window,
  );
  if (!result.allowed) {
    throw new Error('路径访问被拒绝');
  }
}

export function registerWorkspacePreviewProtocol(getWindow: () => BrowserWindow | null): void {
  protocol.handle(SCHEME, async (request) => {
    const parsed = parsePreviewRequestUrl(request.url);
    if (!parsed) {
      return new Response('Invalid preview URL', { status: 400 });
    }

    const { workspaceId, filePath } = parsed;

    try {
      await assertPreviewAccess(workspaceId, filePath, getWindow());
    } catch {
      return new Response('Forbidden', { status: 403 });
    }

    if (!existsSync(filePath)) {
      return new Response('Not Found', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).href);
  });
}
