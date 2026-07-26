/** shadcn 原语，无业务。导出 Button、buttonVariants */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-surface)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary-500)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-600)]",
        destructive:
          "bg-[var(--color-danger)] text-white shadow-[var(--shadow-sm)] hover:opacity-90",
        outline:
          "border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
        secondary:
          "bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-surface-hover)]",
        ghost:
          "hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
        link:
          "text-[var(--color-primary-500)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[var(--radius-md)] px-3 text-xs",
        lg: "h-10 rounded-[var(--radius-md)] px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
