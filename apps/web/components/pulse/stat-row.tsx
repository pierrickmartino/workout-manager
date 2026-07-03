import * as React from "react";

import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: React.ReactNode;
}

interface StatRowProps {
  stats: Stat[];
  className?: string;
}

// A row of headline numbers separated by thin vertical rules — the
// WORKOUTS / HOURS / STREAK and DURATION / VOLUME / TARGET clusters in
// pulse.pen. Value in the display font, label in muted mono.
export function StatRow({ stats, className }: StatRowProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center", className)}>
      {stats.map((stat, index) => (
        <React.Fragment key={stat.label}>
          {index > 0 ? <span className="h-9 w-px shrink-0 bg-border" /> : null}
          <div className="flex flex-1 flex-col items-center gap-1 px-2 text-center">
            <span className="font-display text-2xl font-bold text-text-primary">
              {stat.value}
            </span>
            <span className="label-mono text-[9px] text-text-muted">
              {stat.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
