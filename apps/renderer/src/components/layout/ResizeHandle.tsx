/** 垂直拖拽条，调侧栏或工具面板宽度 */
import { useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * 可拖拽分隔条的回调与附加样式。
 */
interface ResizeHandleProps {
  onResize: (delta: number) => void;
  className?: string;
}

/** 鼠标拖拽时把水平位移传给 onResize */
/**
 * 捕获拖拽期间的水平位移，并在释放鼠标时清理全局事件监听器和临时样式。
 */
export function ResizeHandle({ onResize, className }: ResizeHandleProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;

      /**
       * 根据相邻 mousemove 事件计算增量，使调用方能够累加面板宽度。
       */
      const onMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - lastX;
        lastX = e.clientX;
        if (delta !== 0) onResize(delta);
      };

      /**
       * 结束拖拽并恢复 document 级别的监听器和选择行为。
       */
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      className={cn("app-resize-handle", className)}
    >
      <div className="app-resize-handle__hit" />
    </div>
  );
}
