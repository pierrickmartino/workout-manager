import * as React from "react";

import { cn } from "@/lib/utils";
import { numericInputMode } from "@/lib/input-mode";

// pulse.pen text fields: surface background, lighter border, small radius, with
// the entered value shown in mono — the "operator terminal" input treatment.
//
// Two affordances come from here rather than from 100+ call sites (ADR-0093):
// autofill is **off** unless a field names the token it really carries, and a
// `type="number"` field asks for the keypad its `step` implies. Both are plain
// defaults — a call site that passes `autoComplete` or `inputMode` wins.
export function Input({
  className,
  autoComplete = "off",
  inputMode,
  type,
  step,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-sm border border-border-lite bg-surface px-4 font-mono text-sm text-text-primary placeholder:text-text-muted focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      autoComplete={autoComplete}
      inputMode={inputMode ?? numericInputMode({ type, step })}
      type={type}
      step={step}
      {...props}
    />
  );
}
