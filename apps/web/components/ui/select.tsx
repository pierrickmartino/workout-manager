import * as React from "react";
import { ChevronDown } from "@/components/pulse/icons";

import { cn } from "@/lib/utils";

// Native <select> kept for zero-dependency form behavior, styled to match the
// pulse input treatment with a mono value and a custom chevron.
//
// The chevron and the gutter reserved for it are sized in **px, not rem** (ADR-0087). They are
// the control's own furniture, not text: at 200% text a `pr-10` gutter is 80px, which on a
// 320px screen leaves a field no room at all to show the value it holds. Pinning them keeps
// 100% text pixel-identical and keeps the value legible once the text doubles.
//
// Autofill is off by default (ADR-0093): a Load kind or a distance unit is not
// something a browser has on file, and a call site that names a real token wins.
export function Select({
  className,
  children,
  autoComplete = "off",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <div className="relative">
      <select
        autoComplete={autoComplete}
        className={cn(
          "flex h-11 w-full appearance-none rounded-sm border border-border-lite bg-surface px-4 pr-[40px] font-mono text-sm text-text-primary focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-[12px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}
