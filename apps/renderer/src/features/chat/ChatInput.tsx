/**
 * 消息输入：@文件、$MCP、/skill 提及与图片附件
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { ArrowUp, Plus, X } from "lucide-react";
import type { ImageAttachment } from "@desktop-agent/shared";
import { useChatStore } from "@/stores/chatStore";
import { useMcpStore } from "@/stores/mcpStore";
import { useSkillStore } from "@/stores/skillStore";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileMentionPicker } from "./FileMentionPicker";
import { useFileMentionSearch } from "@/hooks/useFileMentionSearch";

/** 输入光标当前可触发的提及类型。 */
type MentionKind = "file" | "mcp" | "skill" | null;
/** 已创建附件及其仅用于 renderer 展示的预览 URL。 */
type PendingAttachment = ImageAttachment & { previewUrl?: string };

/** 单条消息允许附带的图片数量，必须与主进程附件服务限制一致。 */
const MAX_ATTACHMENTS = 4;

/** 聊天输入组件向父层交付正文和已在主进程创建的附件引用。 */
interface ChatInputProps {
  onSend: (message: string, attachments?: ImageAttachment[]) => void;
}

/** 在光标前文本中选择最后出现的有效提及触发器，避免旧触发器抢占当前菜单。 */
function pickLatestMention(beforeCursor: string): {
  kind: MentionKind;
  query: string;
} {
  const fileMatch = beforeCursor.match(/@([^\s@]*)$/);
  const mcpMatch = beforeCursor.match(/\$([a-zA-Z][a-zA-Z0-9_-]*)$/);
  const skillMatch = beforeCursor.match(/(?:^|\s)\/([a-zA-Z][a-zA-Z0-9_]*)$/);

  const candidates: Array<{ kind: MentionKind; query: string; index: number }> =
    [];
  if (fileMatch) {
    candidates.push({
      kind: "file",
      query: fileMatch[1],
      index: fileMatch.index ?? 0,
    });
  }
  if (mcpMatch) {
    candidates.push({
      kind: "mcp",
      query: mcpMatch[1],
      index: mcpMatch.index ?? 0,
    });
  }
  if (skillMatch) {
    candidates.push({
      kind: "skill",
      query: skillMatch[1],
      index: skillMatch.index ?? 0,
    });
  }

  if (candidates.length === 0) {
    return { kind: null, query: "" };
  }

  candidates.sort((a, b) => b.index - a.index);
  return { kind: candidates[0].kind, query: candidates[0].query };
}

/**
 * 聊天输入区主组件。
 *
 * 附件先通过主进程落盘为草稿，发送后由父层绑定消息；本组件只管理草稿生命周期和 renderer 预览状态。
 */
export function ChatInput({ onSend }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [preview, setPreview] = useState<PendingAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mentionKind, setMentionKind] = useState<MentionKind>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isProcessing } = useChatStore();
  const { currentSessionId } = useSessionStore();
  const { mentionable: mcpMentionable, loadMentionable: loadMcpMentionable } =
    useMcpStore();
  const {
    mentionable: skillMentionable,
    loadMentionable: loadSkillMentionable,
  } = useSkillStore();
  const { results: fileResults, loading: fileLoading } = useFileMentionSearch(
    mentionQuery,
    mentionKind === "file",
  );

  useEffect(() => {
    loadMcpMentionable();
    loadSkillMentionable();
  }, [loadMcpMentionable, loadSkillMentionable]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const filteredMcp = useMemo(() => {
    const query = mentionQuery.toLowerCase();
    return mcpMentionable.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.displayName.toLowerCase().includes(query),
    );
  }, [mcpMentionable, mentionQuery]);

  const filteredSkills = useMemo(() => {
    const query = mentionQuery.toLowerCase();
    return skillMentionable.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.displayName.toLowerCase().includes(query),
    );
  }, [skillMentionable, mentionQuery]);

  const activeListLength =
    mentionKind === "file"
      ? fileResults.length
      : mentionKind === "mcp"
        ? filteredMcp.length
        : mentionKind === "skill"
          ? filteredSkills.length
          : 0;

  /** 根据编辑后光标位置刷新提及菜单，任何输入都重置菜单选中项。 */
  const updateMentionState = (value: string, cursor: number) => {
    const beforeCursor = value.slice(0, cursor);
    const picked = pickLatestMention(beforeCursor);
    setMentionKind(picked.kind);
    setMentionQuery(picked.query);
    setSelectedIndex(0);
  };

  /** 将当前 `@` 查询替换为工作区相对路径并保持焦点，避免发送前丢失编辑上下文。 */
  const insertFileMention = (relativePath: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = input.slice(0, cursor);
    const afterCursor = input.slice(cursor);
    const replaced = beforeCursor.replace(/@[^\s@]*$/, `@${relativePath} `);
    const next = `${replaced}${afterCursor}`;
    setInput(next);
    setMentionKind(null);
    setMentionQuery("");
    requestAnimationFrame(() => textarea.focus());
  };

  /** 将当前 `$` 查询替换为 MCP 名称并关闭菜单。 */
  const insertMcpMention = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = input.slice(0, cursor);
    const afterCursor = input.slice(cursor);
    const replaced = beforeCursor.replace(
      /\$[a-zA-Z][a-zA-Z0-9_-]*$/,
      `$${name} `,
    );
    const next = `${replaced}${afterCursor}`;
    setInput(next);
    setMentionKind(null);
    setMentionQuery("");
    requestAnimationFrame(() => textarea.focus());
  };

  /** 将当前 `/` 查询替换为 Skill 名称，同时保留前导空白分隔符。 */
  const insertSkillMention = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = input.slice(0, cursor);
    const afterCursor = input.slice(cursor);
    const replaced = beforeCursor.replace(
      /(?:^|\s)\/[a-zA-Z][a-zA-Z0-9_-]*$/,
      (match) => `${match.startsWith(" ") ? " " : ""}/${name} `,
    );
    const next = `${replaced}${afterCursor}`;
    setInput(next);
    setMentionKind(null);
    setMentionQuery("");
    requestAnimationFrame(() => textarea.focus());
  };

  /** 关闭提及菜单并清除查询，防止后续按键作用于陈旧列表。 */
  const closeMentionMenu = () => {
    setMentionKind(null);
    setMentionQuery("");
  };

  /** 通过受控 IPC 获取草稿预览 URL，不向 renderer 暴露原始本地路径。 */
  const withPreviewUrl = async (
    attachment: ImageAttachment,
  ): Promise<PendingAttachment> => {
    const result = await window.electronAPI?.attachment.getPreviewUrl(
      attachment.id,
      "thumb",
    );
    return {
      ...attachment,
      previewUrl: result?.success ? result.url : undefined,
    };
  };

  /** 校验总数后并行补充预览 URL，再原子追加到本地草稿列表。 */
  const appendAttachments = async (nextAttachments: ImageAttachment[]) => {
    if (attachments.length + nextAttachments.length > MAX_ATTACHMENTS) {
      setError(`一次最多发送 ${MAX_ATTACHMENTS} 张图片`);
      return;
    }
    const enriched = await Promise.all(nextAttachments.map(withPreviewUrl));
    setAttachments((current) => [...current, ...enriched]);
    setError(null);
  };

  /** 打开主进程文件选择器创建图片草稿；处理期间禁止重复选择。 */
  const handleSelectImages = async () => {
    if (!currentSessionId || isProcessing || uploading) return;
    setUploading(true);
    try {
      const result =
        await window.electronAPI?.attachment.selectImages(currentSessionId);
      if (!result?.success) {
        setError(result?.error || "选择图片失败");
        return;
      }
      if (result.attachments?.length) {
        await appendAttachments(result.attachments);
      }
    } finally {
      setUploading(false);
    }
  };

  /** 拦截剪贴板图片并逐个创建主进程草稿，普通文本粘贴保持浏览器默认行为。 */
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0 || !currentSessionId || isProcessing) return;
    e.preventDefault();

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`一次最多发送 ${MAX_ATTACHMENTS} 张图片`);
      return;
    }

    setUploading(true);
    try {
      const created: ImageAttachment[] = [];
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const result = await window.electronAPI?.attachment.createFromBytes({
          conversationId: currentSessionId,
          fileName: file.name || "clipboard-image.png",
          mimeType: file.type,
          bytes,
        });
        if (!result?.success || !result.attachment) {
          setError(result?.error || "保存图片失败");
          continue;
        }
        created.push(result.attachment);
      }
      if (created.length > 0) {
        await appendAttachments(created);
      }
    } finally {
      setUploading(false);
    }
  };

  /** 乐观移除草稿；主进程删除失败时恢复原项，避免 UI 与落盘状态分叉。 */
  const removeAttachment = async (id: string) => {
    const target = attachments.find((attachment) => attachment.id === id);
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
    if (preview?.id === id) setPreview(null);

    const result = await window.electronAPI?.attachment.deleteDraft(id);
    if (!result?.success) {
      setError(result?.error || "删除图片失败");
      if (target) {
        setAttachments((current) => [...current, target]);
      }
    }
  };

  /** 发送非空正文或附件；清空本地草稿引用由父层后续完成消息绑定。 */
  const handleSubmit = () => {
    if ((!input.trim() && attachments.length === 0) || isProcessing) return;
    onSend(input.trim(), attachments);
    setInput("");
    setAttachments([]);
    setError(null);
    closeMentionMenu();
  };

  /** 优先处理提及菜单导航，未打开菜单时再执行 Enter 发送语义。 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionKind && activeListLength > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % activeListLength);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + activeListLength) % activeListLength,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (mentionKind === "file") {
          insertFileMention(fileResults[selectedIndex].relativePath);
        } else if (mentionKind === "mcp") {
          insertMcpMention(filteredMcp[selectedIndex].name);
        } else {
          insertSkillMention(filteredSkills[selectedIndex].name);
        }
        return;
      }
      if (e.key === "Escape") {
        closeMentionMenu();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 px-6 pb-5 pt-2 bg-[var(--color-bg-surface)]">
      <div className="max-w-[900px] mx-auto relative">
        {mentionKind === "file" && (fileResults.length > 0 || fileLoading) && (
          <FileMentionPicker
            results={fileResults}
            selectedIndex={selectedIndex}
            loading={fileLoading}
            onSelect={insertFileMention}
          />
        )}

        {mentionKind === "mcp" && filteredMcp.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-panel)] overflow-hidden">
            {filteredMcp.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={cn(
                  "w-full px-4 py-2 text-left hover:bg-[var(--color-surface-hover)]",
                  index === selectedIndex && "bg-[var(--color-surface-hover)]",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMcpMention(item.name);
                }}
              >
                <div className="text-sm font-medium text-[var(--color-text-primary)]">
                  ${item.name}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {item.displayName}
                </div>
              </button>
            ))}
          </div>
        )}

        {mentionKind === "skill" && filteredSkills.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-panel)] overflow-hidden">
            {filteredSkills.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={cn(
                  "w-full px-4 py-2 text-left hover:bg-[var(--color-surface-hover)]",
                  index === selectedIndex && "bg-[var(--color-surface-hover)]",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSkillMention(item.name);
                }}
              >
                <div className="text-sm font-medium text-[var(--color-text-primary)]">
                  /{item.name}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {item.displayName}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="overflow-hidden bg-[var(--color-bg-surface)] rounded-[var(--radius-composer)] border border-[var(--color-border-default)] px-4 py-3 shadow-[var(--shadow-sm)] focus-within:border-[var(--color-primary-400)] focus-within:ring-2 focus-within:ring-[var(--color-primary-100)] transition-colors">
          {attachments.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]"
                >
                  <button
                    type="button"
                    onClick={() => setPreview(attachment)}
                    className="block h-full w-full"
                    title={attachment.fileName}
                  >
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-[var(--color-bg-subtle)]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                    title="删除图片"
                    aria-label="删除图片"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Button
              type="button"
              onClick={handleSelectImages}
              disabled={
                isProcessing ||
                uploading ||
                attachments.length >= MAX_ATTACHMENTS
              }
              size="icon"
              variant="ghost"
              className="shrink-0 mb-0.5 h-8 w-8 rounded-full text-[var(--color-text-secondary)]"
              title="添加图片"
              aria-label="添加图片"
            >
              <Plus size={18} />
            </Button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                updateMentionState(e.target.value, e.target.selectionStart);
              }}
              onClick={(e) =>
                updateMentionState(input, e.currentTarget.selectionStart)
              }
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="发送消息，@ 引用文件，$ 选择 MCP，/ 选择 Skill"
              rows={1}
              disabled={isProcessing}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="flex-1 min-h-[36px] max-h-[200px] px-1 py-1 bg-transparent resize-none border-0 outline-none text-[15px] leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />

            <Button
              onClick={handleSubmit}
              disabled={
                (!input.trim() && attachments.length === 0) || isProcessing
              }
              size="icon"
              className="shrink-0 mb-0.5 h-8 w-8 rounded-full"
              title="发送"
              aria-label="发送"
            >
              <ArrowUp size={16} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-2 px-2 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>

      {preview?.previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setPreview(null)}
            title="关闭"
          >
            <X size={18} />
          </button>
          <img
            src={preview.previewUrl}
            alt={preview.fileName}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
