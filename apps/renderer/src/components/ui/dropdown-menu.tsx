import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  children: React.ReactNode;
}

function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

const DropdownMenuContext = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false, setOpen: () => {}
});

function DropdownMenuTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen, open } = React.useContext(DropdownMenuContext);
  return (
    <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
      {children}
    </span>
  );
}

function DropdownMenuContent({ children, align = 'start', className }: { children: React.ReactNode; align?: 'start' | 'end'; className?: string }) {
  const { open, setOpen } = React.useContext(DropdownMenuContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-50 min-w-[160px] rounded-md border border-gray-200 bg-white p-1 shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        'mt-1 top-full',
        className
      )}
    >
      {children}
    </div>
  );
}

function DropdownMenuItem({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  const { setOpen } = React.useContext(DropdownMenuContext);
  return (
    <button
      className={cn(
        'flex items-center w-full rounded-sm px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors',
        className
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.(); setOpen(false); }}
    >
      {children}
    </button>
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
