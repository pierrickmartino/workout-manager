import * as React from "react";

import { cn } from "@/lib/utils";

// Field labels use the pulse mono micro-label treatment: uppercase, muted,
// letter-spaced — the same grammar as the data labels on cards.
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return (
    <label
      className={cn(
        "label-mono text-[11px] font-medium text-text-secondary",
        className,
      )}
      {...props}
    />
  );
}
