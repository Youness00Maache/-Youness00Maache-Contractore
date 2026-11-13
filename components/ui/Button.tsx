import * as React from "react"
import { cn } from '../../lib/utils.ts'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link",
  size?: "default" | "sm" | "lg" | "icon",
  /** Shows a spinner and disables the button. */
  loading?: boolean,
}

const variants = {
  default: "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-110",
  outline: "border border-input bg-card text-foreground hover:bg-muted",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-foreground hover:bg-muted",
  link: "text-primary underline-offset-4 hover:underline",
};

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-8 text-base",
  icon: "h-10 w-10",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", loading = false, disabled, children, type, ...props }, ref) => {
    return (
      <button
        type={type}
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]",
          sizes[size],
          variants[variant],
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
