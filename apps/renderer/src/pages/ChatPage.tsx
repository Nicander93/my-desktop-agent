/** 聊天页：主面板 + 可收起右侧工具区 */
import { ChatPanel } from '@/features/chat/ChatPanel';
import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { ToolPanel } from '@/features/tools-panel/ToolPanel';
import { useUIStore } from '@/stores/uiStore';

/** 聊天主界面布局 */
export function ChatPage() {
  const { toolPanelVisible, adjustToolPanelWidth } = useUIStore();

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0">
        <ChatPanel />
      </div>
      {toolPanelVisible && (
        <>
          <ResizeHandle onResize={adjustToolPanelWidth} />
          <ToolPanel />
        </>
      )}
    </div>
  );
}