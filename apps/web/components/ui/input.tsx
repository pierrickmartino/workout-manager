import * as React from "react";

import { cn } from "@/lib/utils";

// pulse.pen text fields: surface background, lighter border, small radius, with
// the entered value shown in mono — the "operator terminal" input treatment.
export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-sm border border-border-lite bg-surface px-4 font-mono text-sm text-text-primary placeholder:text-text-muted focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
