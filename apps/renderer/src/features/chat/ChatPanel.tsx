/**
 * 聊天主面板
 *
 * 三态 UI：
 * 1. 未选工作区 → 引导创建
 * 2. 未选对话   → 引导新建对话
 * 3. 正常聊天   → MessageList + ChatInput
 */
import { Header } from '@/components/layout/Header';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useAgent } from '@/hooks/useAgent';
import { useNewConversation } from '@/hooks/useNewConversation';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { FolderOpen, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ChatPanel() {
  const { sendMessage } = useAgent();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const { currentSessionId } = useSessionStore();
  const startNewConversation = useNewConversation();

  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  if (!currentWorkspaceId) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Desktop Agent" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 space-y-4">
            <FolderOpen size={48} className="mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-500">请选择或创建工作区</p>
              <p className="text-sm mt-1">在左侧侧边栏中创建工作区以开始对话</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentSessionId) {
    return (
      <div className="flex flex-col h-full">
        <Header title={currentWorkspace?.name || 'Desktop Agent'} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 space-y-4">
            <MessageSquarePlus size={48} className="mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-500">创建新对话</p>
              <p className="text-sm mt-1">点击按钮或左侧「新对话」开始聊天</p>
            </div>
            <Button onClick={() => startNewConversation()}>新对话</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={currentWorkspace?.name || 'Desktop Agent'} />
      <MessageList />
      <ChatInput onSend={sendMessage} />
    </div>
  );
}
