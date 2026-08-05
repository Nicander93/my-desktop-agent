/** shadcn 原语，无业务。导出 DropdownMenu 系列组件 */
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 下拉菜单根组件承载的触发器和内容。
 */
interface DropdownMenuProps {
  children: React.ReactNode;
}

/**
 * 提供下拉菜单打开状态的局部上下文。
 */
function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

/**
 * 在菜单根、触发器和内容之间共享的打开状态。
 */
const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({
  open: false,
  setOpen: () => {},
});

/**
 * 渲染切换菜单打开状态的触发内容，并阻止事件冒泡到外层点击处理器。
 */
function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen, open } = React.useContext(DropdownMenuContext);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setOpen(!open);
      }}
    >
      {children}
    </span>
  );
}

/**
 * 在菜单打开时渲染浮层，并通过 document 监听器处理外部点击关闭。
 */
function DropdownMenuContent({
  children,
  align = "start",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const { open, setOpen } = React.useContext(DropdownMenuContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    /**
     * 当 pointer 目标不在浮层内时关闭菜单。
     */
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 min-w-[160px] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1 shadow-[var(--shadow-panel)]",
        align === "end" ? "right-0" : "left-0",
        "mt-1 top-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 渲染菜单操作项，在执行调用方回调后关闭当前菜单。
 */
function DropdownMenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const { setOpen } = React.useContext(DropdownMenuContext);
  return (
    <button
      className={cn(
        "flex items-center w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
