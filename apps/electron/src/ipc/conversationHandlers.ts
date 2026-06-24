import { ipcMain } from 'electron';
import * as conversationService from '../services/conversationService';
import * as messageService from '../services/messageService';

export function registerConversationHandlers(): void {
  ipcMain.handle('conversation:create', (_, workspaceId: string, title?: string, model?: string) => {
    const conversation = conversationService.createConversation(workspaceId, title, model);
    return { success: true, conversation };
  });

  ipcMain.handle('conversation:get-all', (_, workspaceId: string, includeArchived = false) => {
    const conversations = conversationService.getConversationsByWorkspace(workspaceId, includeArchived);
    return { success: true, conversations };
  });

  ipcMain.handle('conversation:get', (_, id: string) => {
    const conversation = conversationService.getConversation(id);
    if (!conversation) return { success: false, error: '对话不存在' };
    return { success: true, conversation };
  });

  ipcMain.handle('conversation:update', (_, id: string, updates: { title?: string; model?: string; isArchived?: boolean }) => {
    const conversation = conversationService.updateConversation(id, updates);
    if (!conversation) return { success: false, error: '对话不存在' };
    return { success: true, conversation };
  });

  ipcMain.handle('conversation:delete', (_, id: string) => {
    messageService.deleteMessagesByConversation(id);
    const success = conversationService.deleteConversation(id);
    return { success };
  });

  ipcMain.handle('message:create', (_, conversationId: string, role: string, content: string, toolCalls?: unknown[], metadata?: Record<string, unknown>) => {
    const message = messageService.createMessage(
      conversationId, role as messageService.Message['role'], content, toolCalls, metadata
    );
    return { success: true, message };
  });

  ipcMain.handle('message:get-by-conversation', (_, conversationId: string, limit?: number, offset?: number) => {
    const messages = messageService.getMessagesByConversation(conversationId, limit, offset);
    return { success: true, messages };
  });

  ipcMain.handle('message:update', (_, id: string, updates: { content?: string; toolCalls?: unknown[]; metadata?: Record<string, unknown> }) => {
    const message = messageService.updateMessage(id, updates);
    if (!message) return { success: false, error: '消息不存在' };
    return { success: true, message };
  });

  ipcMain.handle('message:delete-by-conversation', (_, conversationId: string) => {
    const success = messageService.deleteMessagesByConversation(conversationId);
    return { success };
  });
}
