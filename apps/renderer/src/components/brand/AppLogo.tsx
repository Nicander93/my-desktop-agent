/** 品牌 Logo */
import { cn } from "@/lib/utils";

/**
 * 品牌图标的可选展示参数。
 */
interface AppLogoProps {
  className?: string;
  size?: number;
  alt?: string;
}

/**
 * 渲染固定来源的应用图标，并允许调用方调整尺寸、替代文本和布局类名。
 */
export function AppLogo({
  className,
  size = 28,
  alt = "Desktop Agent",
}: AppLogoProps) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
