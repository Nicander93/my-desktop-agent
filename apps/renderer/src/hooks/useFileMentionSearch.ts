import { useEffect, useState } from 'react';
import type { FileSearchResult } from '@desktop-agent/shared';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function useFileMentionSearch(query: string, enabled: boolean) {
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !workspaceId) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI?.workspaceFs.search(workspaceId, query);
        if (!cancelled) {
          setResults(result?.success ? result.results ?? [] : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, workspaceId]);

  return { results, loading };
}
