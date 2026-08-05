/** 工具运行中的状态行（转圈 + 文案） */
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 工具活动行的文本、运行状态与附加样式。
 */
interface ActivityStatusProps {
  label: string;
  status: "running" | "completed";
  className?: string;
}

/** 单行活动状态展示 */
/**
 * 以可选旋转图标显示一条正在运行或已结束的工具活动。
 */
export function ActivityStatus({
  label,
  status,
  className,
}: ActivityStatusProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 mt-2 text-sm text-gray-400",
        className,
      )}
    >
      {status === "running" && (
        <Loader2 size={13} className="animate-spin flex-shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}
