import * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControlProps } from "@/components/pulse/field-control";

// Autofill is off by default (ADR-0093): the free-text fields here are workout
// constraints and notes, not anything a browser has on file. A call site that
// names a real token wins.
//
// Inside a `Field` this claims the field's id, hint and error (ADR-0107), so the label
// association holds wherever in the field the control sits.
export function Textarea({
  className,
  autoComplete = "off",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const [field, rest] = useFieldControlProps(props);
  return (
    <textarea
      autoComplete={autoComplete}
      className={cn(
        "flex w-full rounded-sm border border-border-lite bg-surface p-4 font-sans text-sm text-text-primary placeholder:text-text-muted focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...field}
      {...rest}
    />
  );
}
