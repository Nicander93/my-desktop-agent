/** 空状态：图标 + 标题 + 说明 + 操作区 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-1 items-center justify-center p-8', className)}>
      <div className="max-w-md text-center space-y-4">
        {icon && (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] text-[var(--color-text-tertiary)]">
            {icon}
          </div>
        )}
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {description && (
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{description}</p>
          )}
        </div>
        {children}
        {action && <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{action}</div>}
      </div>
    </div>
  );
}
