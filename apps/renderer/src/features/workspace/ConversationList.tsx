/**
 * 工作区下的对话列表
 *
 * 按 updatedAt 显示相对时间，支持选择、重命名和删除对话。
 */
import { useEffect, useState } from "react";
import { Trash2, MoreHorizontal, Pencil } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { useChatStore } from "@/stores/chatStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useGoToChat } from "@/hooks/useGoToChat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * 某个工作区的会话导航列表所需的工作区标识。
 */
interface ConversationListProps {
  workspaceId: string;
}

/**
 * 将更新时间格式化为导航列表中紧凑的相对时间文本。
 */
function formatCompactTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/**
 * 加载并呈现工作区会话，协调选择、重命名与删除时的聊天状态同步。
 */
export function ConversationList({ workspaceId }: ConversationListProps) {
  const {
    sessions,
    currentSessionId,
    loadSessions,
    deleteSession,
    setCurrentSession,
    updateSession,
  } = useSessionStore();
  const { loadMessages, clearMessages, setCurrentConversation } =
    useChatStore();
  const { currentWorkspaceId, selectWorkspace } = useWorkspaceStore();
  const goToChat = useGoToChat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    loadSessions(workspaceId);
  }, [workspaceId, loadSessions]);

  const workspaceSessions = sessions
    .filter((s) => s.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  /**
   * 切换到指定会话；跨工作区时先重置旧聊天状态再加载新消息。
   */
  const handleSelectConversation = async (sessionId: string) => {
    if (editingId) return;
    goToChat();
    if (currentWorkspaceId !== workspaceId) {
      selectWorkspace(workspaceId);
      clearMessages();
    }
    setCurrentSession(sessionId);
    setCurrentConversation(sessionId);
    await loadMessages(sessionId);
  };

  /**
   * 经确认删除会话，若删除的是当前项则清理其内存消息和当前选择。
   */
  const handleDelete = async (sessionId: string) => {
    if (confirm("确定要删除这个对话吗？")) {
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        clearMessages();
        setCurrentConversation(null);
      }
    }
  };

  /**
   * 进入指定会话的内联重命名状态，并以当前标题初始化输入值。
   */
  const startRename = (sessionId: string, title: string) => {
    setEditingId(sessionId);
    setEditTitle(title);
  };

  /**
   * 提交非空且确有变化的标题，然后退出编辑状态。
   */
  const handleRename = async (sessionId: string) => {
    const title = editTitle.trim();
    const session = workspaceSessions.find((s) => s.id === sessionId);
    if (title && session && title !== session.title) {
      await updateSession(sessionId, { title });
    }
    setEditingId(null);
  };

  if (workspaceSessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5 py-1">
      {workspaceSessions.map((session) => (
        <div
          key={session.id}
          onClick={() => handleSelectConversation(session.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRename(session.id, session.title);
          }}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors group cursor-pointer",
            currentSessionId === session.id
              ? "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]",
          )}
        >
          {editingId === session.id ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => handleRename(session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(session.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="flex-1 bg-[var(--color-bg-surface)] border rounded px-1 py-0.5 text-sm min-w-0"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{session.title}</span>
          )}
          <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
            {formatCompactTime(session.updatedAt)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--color-surface-hover)] rounded flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => startRename(session.id, session.title)}
              >
                <Pencil size={12} className="mr-2" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(session.id)}
                className="text-[var(--color-danger)]"
              >
                <Trash2 size={12} className="mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
