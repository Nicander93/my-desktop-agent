import { useEditorStore } from '@/stores/editorStore';

interface FilePathLinkProps {
  path: string;
}

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
