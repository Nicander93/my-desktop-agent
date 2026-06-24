import { Header } from '../layout/Header';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useAgent } from '@/hooks/useAgent';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { FolderOpen, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ChatPanel() {
  const { sendMessage } = useAgent();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const { currentSessionId } = useSessionStore();

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
              <p className="text-sm mt-1">在左侧侧边栏的工作区中点击 + 创建对话</p>
            </div>
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
