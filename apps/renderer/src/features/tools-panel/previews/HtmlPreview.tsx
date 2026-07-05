import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Button } from '@/components/ui/button';

interface HtmlPreviewProps {
  filePath: string;
}

export function HtmlPreview({ filePath }: HtmlPreviewProps) {
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPreviewUrl = useCallback(async () => {
    if (!workspaceId) {
      setError('请先选择工作区');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI?.workspaceFs.getPreviewUrl(workspaceId, filePath);
      if (!result?.success || !result.url) {
        setError(result?.error || '无法加载预览');
        setPreviewUrl(null);
        return;
      }
      setPreviewUrl(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载预览');
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filePath]);

  useEffect(() => {
    loadPreviewUrl();
  }, [loadPreviewUrl]);

  const handleRefresh = () => {
    if (iframeRef.current?.contentWindow && previewUrl) {
      try {
        iframeRef.current.contentWindow.location.reload();
        return;
      } catch {
        // fallback below
      }
    }
    loadPreviewUrl();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 p-4 text-gray-400 text-sm">
        加载预览中...
      </div>
    );
  }

  if (error || !previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-4 text-center gap-2">
        <p className="text-sm text-red-600">{error || '预览不可用'}</p>
        <Button variant="outline" size="sm" onClick={loadPreviewUrl}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-end px-2 py-1 border-b border-gray-200 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleRefresh}>
          <RefreshCw size={12} />
          刷新
        </Button>
      </div>
      <iframe
        ref={iframeRef}
        src={previewUrl}
        sandbox="allow-scripts allow-same-origin"
        title="HTML 预览"
        className="flex-1 w-full min-h-0 border-0 bg-white"
      />
    </div>
  );
}
