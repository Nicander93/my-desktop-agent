/**
 * Preload 脚本：通过 contextBridge 暴露安全的 IPC API 给渲染进程
 *
 * 命名空间：
 * - agent: Agent session 生命周期与消息
 * - workspace: 工作区 CRUD
 * - conversation: 对话 CRUD
 * - message: 消息 CRUD
 * - dialog: 系统对话框（选目录、路径确认）
 * - workspaceFs: 工作区文件读写
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  agent: {
    createSession: (sessionId: string) =>
      ipcRenderer.invoke('agent:create-session', sessionId),
    sendMessage: (sessionId: string, content: string) =>
      ipcRenderer.invoke('agent:send-message', sessionId, content),
    prompt: (sessionId: string, content: string) =>
      ipcRenderer.invoke('agent:prompt', sessionId, content),
    getMessages: (sessionId: string) =>
      ipcRenderer.invoke('agent:get-messages', sessionId),
    closeSession: (sessionId: string) =>
      ipcRenderer.invoke('agent:close-session', sessionId),
    /** 订阅 Agent 流式输出，返回取消订阅函数 */
    onStreamMessage: (callback: (data: { sessionId: string; message: any }) => void) => {
      const listener = (_: any, data: { sessionId: string; message: any }) => callback(data);
      ipcRenderer.on('agent:stream-message', listener);
      return () => { ipcRenderer.removeListener('agent:stream-message', listener); };
    }
  },

  workspace: {
    create: (name: string, description?: string) =>
      ipcRenderer.invoke('workspace:create', name, description),
    createFromPath: (name: string, path: string, description?: string) =>
      ipcRenderer.invoke('workspace:create-from-path', name, path, description),
    getAll: () =>
      ipcRenderer.invoke('workspace:get-all'),
    get: (id: string) =>
      ipcRenderer.invoke('workspace:get', id),
    update: (id: string, updates: { name?: string; description?: string; icon?: string; color?: string }) =>
      ipcRenderer.invoke('workspace:update', id, updates),
    delete: (id: string) =>
      ipcRenderer.invoke('workspace:delete', id),
    touch: (id: string) =>
      ipcRenderer.invoke('workspace:touch', id),
    getSettings: (workspaceId: string) =>
      ipcRenderer.invoke('workspace:get-settings', workspaceId),
    updateSettings: (workspaceId: string, settings: { allowedPaths?: string[]; restrictedMode?: boolean }) =>
      ipcRenderer.invoke('workspace:update-settings', workspaceId, settings)
  },

  conversation: {
    create: (workspaceId: string, title?: string, model?: string) =>
      ipcRenderer.invoke('conversation:create', workspaceId, title, model),
    getAll: (workspaceId: string, includeArchived?: boolean) =>
      ipcRenderer.invoke('conversation:get-all', workspaceId, includeArchived),
    get: (id: string) =>
      ipcRenderer.invoke('conversation:get', id),
    update: (id: string, updates: { title?: string; model?: string; isArchived?: boolean }) =>
      ipcRenderer.invoke('conversation:update', id, updates),
    delete: (id: string) =>
      ipcRenderer.invoke('conversation:delete', id)
  },

  message: {
    create: (conversationId: string, role: string, content: string, toolCalls?: unknown[], metadata?: Record<string, unknown>) =>
      ipcRenderer.invoke('message:create', conversationId, role, content, toolCalls, metadata),
    getByConversation: (conversationId: string, limit?: number, offset?: number) =>
      ipcRenderer.invoke('message:get-by-conversation', conversationId, limit, offset),
    update: (id: string, updates: { content?: string; toolCalls?: unknown[]; metadata?: Record<string, unknown> }) =>
      ipcRenderer.invoke('message:update', id, updates),
    deleteByConversation: (conversationId: string) =>
      ipcRenderer.invoke('message:delete-by-conversation', conversationId)
  },

  dialog: {
    selectDirectory: (options?: { title?: string; defaultPath?: string }) =>
      ipcRenderer.invoke('dialog:select-directory', options),
    confirmPathAccess: (options: { workspacePath: string; targetPath: string }) =>
      ipcRenderer.invoke('dialog:confirm-path-access', options)
  },

  workspaceFs: {
    stat: (workspaceId: string, path: string) =>
      ipcRenderer.invoke('workspace-fs:stat', workspaceId, path),
    read: (workspaceId: string, path: string) =>
      ipcRenderer.invoke('workspace-fs:read', workspaceId, path),
    write: (workspaceId: string, path: string, content: string) =>
      ipcRenderer.invoke('workspace-fs:write', workspaceId, path, content),
    readDir: (workspaceId: string, dirPath: string) =>
      ipcRenderer.invoke('workspace-fs:read-dir', workspaceId, dirPath),
  }
});
