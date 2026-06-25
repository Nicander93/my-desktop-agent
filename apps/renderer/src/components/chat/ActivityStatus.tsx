import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityStatusProps {
  label: string;
  status: 'running' | 'completed';
  className?: string;
}

export function ActivityStatus({ label, status, className }: ActivityStatusProps) {
  return (
    <div className={cn('flex items-center gap-2 mt-2 text-sm text-gray-400', className)}>
      {status === 'running' && (
        <Loader2 size={13} className="animate-spin flex-shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}
