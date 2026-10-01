import * as React from "react";

import { cn } from "@/lib/utils";
import { numericInputMode } from "@/lib/input-mode";

// pulse.pen text fields: surface background, lighter border, small radius, with
// the entered value shown in mono — the "operator terminal" input treatment.
//
// Three affordances come from here rather than from 100+ call sites (ADR-0093,
// ADR-0103): autofill is **off** unless a field names the token it really carries, a
// `type="number"` field asks for the keypad its `step` implies, and a search box is not
// spell-checked — a query is not prose, and a red underline under half of a movement
// name typed so far is noise on every search screen in the app. All three are plain
// defaults; a call site that passes the attribute wins.
//
// Spelling is derived for `type="search"` only. A single-line field here can hold a
// tempo code or a set note, and the two want opposite answers, so a value field declares
// `spellCheck` where it stands (`lib/spellcheck-policy.ts` holds that).
export function Input({
  className,
  autoComplete = "off",
  inputMode,
  spellCheck,
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
      spellCheck={spellCheck ?? (type === "search" ? false : undefined)}
      type={type}
      step={step}
      {...props}
    />
  );
}
