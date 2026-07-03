import * as React from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  // Section label; the leading "▸ " marker is added automatically.
  children: React.ReactNode;
  // Optional right-aligned mono label (a counter like "04/05" or "SEE ALL").
  meta?: React.ReactNode;
  className?: string;
}

// The "▸ WEEK CYCLE ————— 04/05" section divider used throughout pulse.pen: a
// cyan mono label, a border line that fills the remaining width, and an
// optional trailing meta label.
export function SectionHeader({
  children,
  meta,
  className,
}: SectionHeaderProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="label-mono shrink-0 text-[11px] font-semibold tracking-wider text-cyan">
        <span aria-hidden>▸ </span>
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
      {meta ? (
        <span className="label-mono shrink-0 text-[10px] font-normal text-text-muted">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
