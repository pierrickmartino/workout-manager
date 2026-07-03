import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Small status pills — used for provenance flags, "READY", "AI-GENERATED",
// LINKED, etc. All render in the mono micro-label style.
const badgeVariants = cva(
  "label-mono inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-medium",
  {
    variants: {
      variant: {
        cyan: "bg-cyan-dim text-cyan",
        magenta: "bg-magenta-dim text-magenta",
        muted: "bg-elevated text-text-muted",
        outline: "border border-border text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
