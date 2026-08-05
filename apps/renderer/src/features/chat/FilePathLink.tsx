/** 消息内可点击路径，打开右侧编辑器 */
import { useEditorStore } from "@/stores/editorStore";

/**
 * 可在右侧编辑器中打开的工作区路径。
 */
interface FilePathLinkProps {
  path: string;
}

/** 文件路径链接按钮 */
/**
 * 将聊天内容中的文件路径渲染为打开编辑器的按钮。
 */
export function FilePathLink({ path }: FilePathLinkProps) {
  const openFile = useEditorStore((s) => s.openFile);

  return (
    <button
      type="button"
      onClick={() => openFile(path)}
      className="text-blue-600 hover:underline font-mono text-[0.875em] break-all text-left"
      title={`打开 ${path}`}
    >
      {path}
    </button>
  );
}
