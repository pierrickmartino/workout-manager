import * as React from "react";

import { cn } from "@/lib/utils";

type Accent = "cyan" | "violet" | "magenta" | "blue";

interface SegmentedBarProps {
  // Completion 0–1; rounds to the nearest of `segments` filled cells.
  value: number;
  segments?: number;
  accent?: Accent;
  className?: string;
}

const ACCENT_BG: Record<Accent, string> = {
  cyan: "bg-cyan",
  violet: "bg-violet",
  magenta: "bg-magenta",
  blue: "bg-blue",
};

// The segmented progress meter from pulse.pen queued-protocol rows: a fixed
// number of rounded cells, filled cells in the accent color and the rest in the
// elevated surface. A clearer, more "instrument" read than a smooth bar.
export function SegmentedBar({
  value,
  segments = 10,
  accent = "cyan",
  className,
}: SegmentedBarProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * segments);

  return (
    <div
      className={cn("flex gap-[3px]", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1 flex-1 rounded-[1px]",
            index < filled ? ACCENT_BG[accent] : "bg-elevated",
          )}
        />
      ))}
    </div>
  );
}
