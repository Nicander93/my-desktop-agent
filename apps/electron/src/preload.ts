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
  }
});
