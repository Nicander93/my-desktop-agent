/**
 * 渲染进程 electronAPI 类型声明
 * 与 apps/electron/src/preload.ts 暴露的 API 一一对应
 */
declare global {
  interface Window {
    electronAPI?: {
      agent: {
        createSession: (sessionId: string) => Promise<{ success: boolean; sessionId: string }>;
        sendMessage: (sessionId: string, content: string) => Promise<{ success: boolean; messages?: unknown[]; error?: string }>;
        prompt: (sessionId: string, content: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        getMessages: (sessionId: string) => Promise<{ success: boolean; messages?: unknown[] }>;
        closeSession: (sessionId: string) => Promise<{ success: boolean }>;
        onStreamMessage: (callback: (data: { sessionId: string; message: unknown }) => void) => (() => void) | void;
      };
      workspace: {
        create: (name: string, description?: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        createFromPath: (name: string, path: string, description?: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        getAll: () => Promise<{ success: boolean; workspaces?: any[]; error?: string }>;
        get: (id: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        update: (id: string, updates: { name?: string; description?: string; icon?: string; color?: string }) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean }>;
        touch: (id: string) => Promise<{ success: boolean }>;
        getSettings: (workspaceId: string) => Promise<{ success: boolean; settings?: any }>;
        updateSettings: (workspaceId: string, settings: { allowedPaths?: string[]; restrictedMode?: boolean }) => Promise<{ success: boolean }>;
      };
      conversation: {
        create: (workspaceId: string, title?: string, model?: string) => Promise<{ success: boolean; conversation?: any; error?: string }>;
        getAll: (workspaceId: string, includeArchived?: boolean) => Promise<{ success: boolean; conversations?: any[]; error?: string }>;
        get: (id: string) => Promise<{ success: boolean; conversation?: any; error?: string }>;
        update: (id: string, updates: { title?: string; model?: string; isArchived?: boolean }) => Promise<{ success: boolean; conversation?: any; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean }>;
      };
      message: {
        create: (conversationId: string, role: string, content: string, toolCalls?: unknown[], metadata?: Record<string, unknown>) => Promise<{ success: boolean; message?: any }>;
        getByConversation: (conversationId: string, limit?: number, offset?: number) => Promise<{ success: boolean; messages?: any[] }>;
        update: (id: string, updates: { content?: string; toolCalls?: unknown[]; metadata?: Record<string, unknown> }) => Promise<{ success: boolean; message?: any }>;
        deleteByConversation: (conversationId: string) => Promise<{ success: boolean }>;
      };
      dialog: {
        selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
        confirmPathAccess: (options: { workspacePath: string; targetPath: string }) => Promise<{ success: boolean; response?: number; alwaysAllow?: boolean }>;
      };
      workspaceFs: {
        stat: (workspaceId: string, path: string) => Promise<{ success: boolean; stat?: import('@desktop-agent/shared').FileStat; error?: string }>;
        read: (workspaceId: string, path: string) => Promise<{ success: boolean; file?: import('@desktop-agent/shared').ReadFileResult; error?: string }>;
        write: (workspaceId: string, path: string, content: string) => Promise<{ success: boolean; error?: string }>;
        readDir: (workspaceId: string, dirPath: string) => Promise<{ success: boolean; entries?: import('@desktop-agent/shared').FileEntry[]; error?: string }>;
      };
    };
  }
}

export {};
