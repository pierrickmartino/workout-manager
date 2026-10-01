import * as React from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  // Section label; the leading "▸ " marker is added automatically.
  children: React.ReactNode;
  // Optional right-aligned mono label (a counter like "04/05" or "SEE ALL").
  meta?: React.ReactNode;
  className?: string;
  // Where this divider sits in the page outline. 2 — directly under the PageHeader's
  // <h1> — is what almost every use wants; 3 is for a divider nested inside a section
  // another divider already opened (ADR-0094).
  level?: 2 | 3;
}

// The "▸ WEEK CYCLE ————— 04/05" section divider used throughout pulse.pen: a
// cyan mono label, a border line that fills the remaining width, and an
// optional trailing meta label.
//
// The label is a real heading (ADR-0094). This component is the app's only section
// divider, so with it as a <div> the pages below the <h1> had no outline at all and
// screen-reader heading navigation — the way a non-visual reader skims — landed
// nowhere. The marker is aria-hidden and the meta is a sibling, so the accessible
// name is the section's name and nothing else. Tailwind's preflight drops the
// browser's heading size, weight and margins, so the rendered row is unchanged.
export function SectionHeader({
  children,
  meta,
  className,
  level = 2,
}: SectionHeaderProps): React.JSX.Element {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Heading className="label-mono shrink-0 text-[11px] font-semibold tracking-wider text-cyan">
        <span aria-hidden>▸ </span>
        {children}
      </Heading>
      <span className="h-px flex-1 bg-border" />
      {meta ? (
        <span className="label-mono shrink-0 text-[10px] font-normal text-text-muted">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
