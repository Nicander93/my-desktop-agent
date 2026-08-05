/** 单条工具调用卡片（状态图标 + 名称） */
import {
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  Circle,
} from "lucide-react";
import { ToolCall } from "@/stores/chatStore";
import { getToolActivityLabel } from "@/lib/toolActivityLabel";

/**
 * 工具调用摘要和可选的详情打开回调。
 */
interface ToolCallCardProps {
  toolCall: ToolCall;
  onClick?: () => void;
}

/** 工具调用摘要卡片 */
/**
 * 显示单次工具调用的名称与状态，点击后由调用方决定是否打开详情。
 */
export function ToolCallCard({ toolCall, onClick }: ToolCallCardProps) {
  /**
   * 依据当前调用状态生成摘要卡片的状态图标。
   */
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case "pending":
        return <Circle size={16} className="text-[var(--color-text-muted)]" />;
      case "running":
        return (
          <Loader2
            size={16}
            className="text-[var(--color-info)] animate-spin"
          />
        );
      case "completed":
        return (
          <CheckCircle size={16} className="text-[var(--color-success)]" />
        );
      case "error":
        return <XCircle size={16} className="text-[var(--color-danger)]" />;
    }
  };

  /**
   * 将内部状态转换为用户可读的中文状态文本。
   */
  const getStatusText = () => {
    switch (toolCall.status) {
      case "pending":
        return "等待执行";
      case "running":
        return "执行中...";
      case "completed":
        return "执行完成";
      case "error":
        return "执行失败";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        w-full flex items-center gap-3 px-3 py-2
        bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)]
        hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)]
        transition-colors text-left
      "
    >
      {getStatusIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {getToolActivityLabel(toolCall.toolName, toolCall.input)}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {getStatusText()}
        </p>
      </div>
      <ChevronRight size={16} className="text-[var(--color-text-muted)]" />
    </button>
  );
}
