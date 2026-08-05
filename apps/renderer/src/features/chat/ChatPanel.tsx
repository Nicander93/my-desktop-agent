/**
 * 聊天主面板
 *
 * 三态 UI：
 * 1. 未选工作区 → 引导创建
 * 2. 未选对话   → 引导新建对话
 * 3. 正常聊天   → MessageList + ChatInput
 */
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { useAgent } from "@/hooks/useAgent";
import { useNewConversation } from "@/hooks/useNewConversation";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSessionStore } from "@/stores/sessionStore";
import { FolderOpen, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/features/workspace/CreateWorkspaceDialog";

/**
 * 根据工作区和会话选择状态渲染聊天区，缺失上下文时提供相应的创建引导。
 */
export function ChatPanel() {
  const { sendMessage } = useAgent();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const { currentSessionId } = useSessionStore();
  const startNewConversation = useNewConversation();
  const [createOpen, setCreateOpen] = useState(false);

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  if (!currentWorkspaceId) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-bg-surface)]">
        <Header title="Desktop Agent" />
        <EmptyState
          icon={<FolderOpen size={28} />}
          title="选择一个工作区"
          description="Agent 将在该目录中读取和处理文件。在左侧创建工作区，或点击下方按钮开始。"
          action={
            <Button onClick={() => setCreateOpen(true)}>选择文件夹</Button>
          }
        />
        <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    );
  }

  if (!currentSessionId) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-bg-surface)]">
        <Header title={currentWorkspace?.name || "Desktop Agent"} />
        <EmptyState
          icon={<MessageSquarePlus size={28} />}
          title="开始一个新任务"
          description="整理目录、修改代码、分析表格或生成文档——描述任务，Agent 会调用工具完成。"
          action={
            <Button onClick={() => startNewConversation()}>新建对话</Button>
          }
        >
          <ul className="text-left text-sm text-[var(--color-text-secondary)] space-y-1.5 mx-auto max-w-xs">
            <li>· 整理一个目录</li>
            <li>· 修改项目代码</li>
            <li>· 分析 Excel 数据</li>
            <li>· 创建一份 PPT</li>
          </ul>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-surface)]">
      <Header />
      <MessageList />
      <ChatInput onSend={sendMessage} />
    </div>
  );
}
