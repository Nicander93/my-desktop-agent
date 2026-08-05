/**
 * 单条消息：parts 驱动 thinking、工具日志与正文
 */
import { useEffect, useState } from "react";
import { Bot, Check, Copy, ExternalLink, Pencil, X } from "lucide-react";
import type { ImageAttachment, MessagePart } from "@desktop-agent/shared";
import { Message, ToolCall } from "@/stores/chatStore";
import { MarkdownContent } from "./MarkdownContent";
import { ToolActivityLog } from "./ToolActivityLog";
import { ThoughtSection } from "./ThoughtSection";
import { useUIStore } from "@/stores/uiStore";
import { getStreamPhase } from "@/lib/agentMessage";
import { derivePartsFromLegacy } from "@/lib/messageParts";

/**
 * 消息列表项所需的标准化聊天消息。
 */
interface MessageItemProps {
  message: Message;
}

/**
 * 懒加载消息图片缩略图，并提供不离开聊天界面的全尺寸预览。
 */
function AttachmentGrid({ attachments }: { attachments?: ImageAttachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    attachment: ImageAttachment;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!attachments?.length) return;
    for (const attachment of attachments) {
      if (urls[attachment.id]) continue;
      window.electronAPI?.attachment
        .getPreviewUrl(attachment.id, "thumb")
        .then((result) => {
          if (result?.success && result.url) {
            setUrls((current) => ({
              ...current,
              [attachment.id]: result.url!,
            }));
          }
        });
    }
  }, [attachments, urls]);

  if (!attachments?.length) return null;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        {attachments.map((attachment) => {
          const url = urls[attachment.id];
          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => url && setPreview({ attachment, url })}
              className="h-24 w-24 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]"
              title={attachment.fileName}
            >
              {url ? (
                <img
                  src={url}
                  alt={attachment.fileName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[var(--color-bg-subtle)]" />
              )}
            </button>
          );
        })}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setPreview(null)}
            aria-label="关闭"
            title="关闭"
          >
            <X size={18} />
          </button>
          <img
            src={preview.url}
            alt={preview.attachment.fileName}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

/**
 * 优先采用流式过程生成的 parts；历史消息则从旧字段兼容推导出相同结构。
 */
function resolveParts(message: Message): MessagePart[] {
  if (message.parts?.length) return message.parts;
  return derivePartsFromLegacy(message);
}

/**
 * 按 part 中保存的稳定 ID 顺序恢复工具组对应的工具调用记录。
 */
function getToolCallsForGroup(
  group: Extract<MessagePart, { type: "tool_group" }>,
  all: ToolCall[],
): ToolCall[] {
  return group.toolCallIds
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is ToolCall => !!t);
}

/** 用户/助手消息气泡 */
/**
 * 按用户或 Agent 角色呈现消息，并将思考、工具组、正文和附件组合为稳定的显示顺序。
 */
export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const openTracePanel = useUIStore((s) => s.openTracePanel);

  /**
   * 复制已完成消息正文；流式期间不暴露该操作以避免复制不完整内容。
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] group">
          <div className="px-4 py-2.5 rounded-[var(--radius-lg)] bg-[var(--color-primary-50)] text-[var(--color-text-primary)] text-[15px] leading-relaxed">
            <AttachmentGrid attachments={message.attachments} />
            {message.content && (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
          <div className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              title="复制"
              aria-label="复制"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              title="编辑"
              aria-label="编辑"
            >
              <Pencil size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const toolCalls = message.toolCalls || [];
  const parts = resolveParts(message);
  const phase = getStreamPhase(toolCalls);
  const hasTrace = (message.trace?.spans.length ?? 0) > 0;
  const canCopy = !!message.content?.trim() && !message.isStreaming;

  const lastPartIndex = parts.length - 1;
  const lastPart = parts[lastPartIndex];
  const isThoughtStreaming =
    !!message.isStreaming && lastPart?.type === "thinking";
  const showTextCursor =
    !!message.isStreaming &&
    phase === "responding" &&
    lastPart?.type === "text";
  const showResponse =
    parts.some((p) => p.type === "text") || isThoughtStreaming;

  return (
    <div className="flex gap-3 py-1 group">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-primary-600)]">
        <Bot size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        {parts.map((part, index) => {
          const isLast = index === lastPartIndex;

          if (part.type === "thinking") {
            return (
              <ThoughtSection
                key={part.id}
                thinking={part.text}
                durationMs={isLast ? message.thinkingDurationMs : undefined}
                isStreaming={isLast && isThoughtStreaming}
              />
            );
          }

          if (part.type === "tool_group") {
            const groupTools = getToolCallsForGroup(part, toolCalls);
            if (groupTools.length === 0) return null;
            return (
              <ToolActivityLog
                key={part.id}
                toolCalls={groupTools}
                traceSpans={message.trace?.spans}
                isStreaming={isLast && !!message.isStreaming}
              />
            );
          }

          if (part.type === "text") {
            const prev = parts[index - 1];
            if (
              prev?.type === "thinking" &&
              prev.text.trim() === part.text.trim()
            ) {
              return null;
            }
            return (
              <div
                key={part.id}
                className="mb-3 last:mb-0 text-[15px] leading-relaxed text-[var(--color-text-primary)]"
              >
                <MarkdownContent
                  content={part.text}
                  isStreaming={isLast && showTextCursor}
                />
              </div>
            );
          }

          return null;
        })}

        {hasTrace && (
          <button
            type="button"
            onClick={openTracePanel}
            className="mb-2 flex items-center gap-1 text-[12px] text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)] transition-colors"
          >
            <ExternalLink size={12} />
            在右侧面板查看任务详情
          </button>
        )}

        {!showResponse && message.isStreaming && parts.length === 0 && (
          <div className="text-[var(--color-text-muted)] text-[15px]">…</div>
        )}

        {canCopy && (
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              title="复制"
              aria-label="复制"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
