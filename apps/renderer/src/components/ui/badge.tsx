/** shadcn 原语，无业务。导出 Badge、badgeVariants */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * 徽标的颜色变体与基础排版类。
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-sm)] border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-primary-500)] text-white shadow-[var(--shadow-sm)]",
        secondary:
          "border-transparent bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]",
        destructive:
          "border-transparent bg-[var(--color-danger)] text-white shadow-[var(--shadow-sm)]",
        outline:
          "border-[var(--color-border-default)] text-[var(--color-text-primary)]",
        success:
          "border-transparent bg-[var(--color-success)]/15 text-[var(--color-success)]",
        warning:
          "border-transparent bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * 徽标组件的 HTML 属性及颜色变体。
 */
export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * 显示紧凑的状态或分类标签。
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
