/** 轻量 Tabs 原语，供右栏等场景复用 */
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * 一个可切换标签的稳定标识、显示文本和可选图标。
 */
export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
}

/**
 * 受控标签栏的可选项与当前选择值。
 */
interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

/**
 * 渲染可访问的受控标签栏，并在用户选择时回传标签标识。
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: TabsProps<T>) {
  return (
    <div
      className={cn("flex gap-0.5 overflow-x-auto", className)}
      role="tablist"
    >
      {items.map((tab) => {
        const active = value === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 shrink-0 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {Icon && <Icon size={14} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
