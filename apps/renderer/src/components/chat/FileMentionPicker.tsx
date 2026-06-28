import { Folder, File } from 'lucide-react';
import type { FileSearchResult } from '@desktop-agent/shared';
import { cn } from '@/lib/utils';

interface FileMentionPickerProps {
  results: FileSearchResult[];
  selectedIndex: number;
  loading?: boolean;
  onSelect: (relativePath: string) => void;
}

export function FileMentionPicker({ results, selectedIndex, loading, onSelect }: FileMentionPickerProps) {
  if (loading && results.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-gray-200 bg-white shadow-lg px-4 py-3 text-sm text-gray-500">
        搜索中…
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden max-h-64 overflow-y-auto">
      {results.map((item, index) => (
        <button
          key={item.path}
          type="button"
          className={cn(
            'w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 min-w-0',
            index === selectedIndex && 'bg-gray-50',
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.relativePath);
          }}
        >
          {item.isDirectory ? (
            <Folder size={16} className="shrink-0 text-amber-500" />
          ) : (
            <File size={16} className="shrink-0 text-gray-400" />
          )}
          <span className="text-sm text-gray-800 truncate font-mono">{item.relativePath}</span>
        </button>
      ))}
    </div>
  );
}
