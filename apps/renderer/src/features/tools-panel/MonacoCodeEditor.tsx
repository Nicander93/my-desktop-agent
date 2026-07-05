import Editor from '@monaco-editor/react';
import { getLanguageFromPath } from '@/lib/fileTypeUtils';

interface MonacoCodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
}

export function MonacoCodeEditor({ path, value, onChange }: MonacoCodeEditorProps) {
  const language = getLanguageFromPath(path);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      theme="vs-light"
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
