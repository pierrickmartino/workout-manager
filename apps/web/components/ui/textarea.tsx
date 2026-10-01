import * as React from "react";

import { cn } from "@/lib/utils";

// Autofill is off by default (ADR-0093): the free-text fields here are workout
// constraints and notes, not anything a browser has on file. A call site that
// names a real token wins.
export function Textarea({
  className,
  autoComplete = "off",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      autoComplete={autoComplete}
      className={cn(
        "flex w-full rounded-sm border border-border-lite bg-surface p-4 font-sans text-sm text-text-primary placeholder:text-text-muted focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
