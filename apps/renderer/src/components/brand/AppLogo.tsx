/** 品牌 Logo */
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  size?: number;
  alt?: string;
}

export function AppLogo({ className, size = 28, alt = 'Desktop Agent' }: AppLogoProps) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
    />
  );
}
