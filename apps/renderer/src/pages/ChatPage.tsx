import { ChatPanel } from '@/components/chat/ChatPanel';
import { ToolPanel } from '@/components/tools/ToolPanel';
import { useUIStore } from '@/stores/uiStore';

export function ChatPage() {
  const { toolPanelVisible } = useUIStore();

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0">
        <ChatPanel />
      </div>
      {toolPanelVisible && <ToolPanel />}
    </div>
  );
}