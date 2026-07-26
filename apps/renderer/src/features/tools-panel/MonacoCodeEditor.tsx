/** Monaco 文本编辑器封装，语言按路径推断 */
import Editor from '@monaco-editor/react';
import { getLanguageFromPath } from '@/lib/fileTypeUtils';
import { useUIStore } from '@/stores/uiStore';

interface MonacoCodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
}

/** Monaco 代码编辑区 */
export function MonacoCodeEditor({ path, value, onChange }: MonacoCodeEditorProps) {
  const language = getLanguageFromPath(path);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: 'on',
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        padding: { top: 8 },
      }}
    />
  );
}
