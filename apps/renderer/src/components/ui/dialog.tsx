/** shadcn 原语，无业务。导出 Dialog 系列组件 */
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 受控对话框的可见状态、状态回调和内容。
 */
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * 在打开时渲染遮罩和内容，并允许点击遮罩请求关闭。
 */
function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-50">{children}</div>
    </div>
  );
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] p-6 shadow-[var(--shadow-panel)] border border-[var(--color-border-default)]",
      className,
    )}
    {...props}
  >
    {children}
  </div>
));
DialogContent.displayName = "DialogContent";

/**
 * 为对话框标题区域提供垂直布局容器。
 */
function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5", className)} {...props} />
  );
}

/**
 * 渲染语义化的对话框标题。
 */
function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-lg font-semibold text-[var(--color-text-primary)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 渲染对话框标题下的辅助说明。
 */
function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--color-text-secondary)]", className)}
      {...props}
    />
  );
}

/**
 * 右对齐放置对话框的确认与取消操作。
 */
function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex justify-end gap-2 mt-6", className)} {...props} />
  );
}

/**
 * 包裹用于打开对话框的触发内容，并转发点击回调。
 */
function DialogTrigger({
  children,
  asChild,
  onClick,
}: {
  children: React.ReactNode;
  asChild?: boolean;
  onClick?: () => void;
}) {
  return (
    <span onClick={onClick} className="cursor-pointer">
      {children}
    </span>
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
};
