import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Button styling follows pulse.pen: the primary action is a cyan block with
// dark on-accent text in uppercase mono ("INITIATE SESSION", "CREATE ACCOUNT");
// secondary actions are bordered surface chips in the body font.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-cyan text-on-accent font-mono font-bold uppercase tracking-wider hover:bg-cyan/90",
        secondary:
          "bg-surface text-text-primary border border-border-lite hover:bg-elevated",
        outline:
          "border border-border text-text-secondary hover:border-border-lite hover:text-text-primary",
        ghost: "text-text-secondary hover:bg-surface hover:text-text-primary",
        destructive:
          "bg-magenta-dim text-magenta font-mono font-semibold uppercase tracking-wider hover:bg-magenta/20",
        link: "text-cyan underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-4 text-sm",
        lg: "h-13 px-5 py-4 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
