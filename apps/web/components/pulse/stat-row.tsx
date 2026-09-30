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
//
// The row **wraps**, and each cell asks for 4rem, which is ADR-0087's mechanism rather than a
// breakpoint: a `flex-1` cell's automatic minimum is its content, and a one-word mono label
// like "EXERCISES" has nowhere to break, so at 200% text (root 16px → 32px, viewport
// unchanged) three cells could not fit a 320px screen and the document went to 379px. A
// breakpoint is no remedy — Tailwind's are `rem` too — and squeezing is worse: mid-word
// breaking a label is not a layout to reach for.
//
// 4rem, not ADR-0087's 5rem, and the difference is measured rather than preferred: inside a
// hero Card on a 320px screen the row has ~230px, so three 5rem asks plus two rules came to
// 242px and wrapped **at 100% text** — changing the phone layout, which this must not do. Three
// 4rem asks come to 194px, fit on one line, and `grow` then splits the row equally, which is
// the same three equal cells `flex-1` produced. ADR-0087's 5rem is the floor a form *control*
// stays readable at, furniture included; a stat cell holds a short number and a 9px mono label
// and has no furniture to pay for.
//
// One cosmetic cost, stated: a wrapped line can begin with one of the vertical rules, since
// CSS cannot tell a sibling it is now first on its line. A thin stray rule at 200% text is a
// better trade than a page that scrolls sideways (ADR-0085).
export function StatRow({ stats, className }: StatRowProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-wrap items-center", className)}>
      {stats.map((stat, index) => (
        <React.Fragment key={stat.label}>
          {index > 0 ? <span className="h-9 w-px shrink-0 bg-border" /> : null}
          <div className="flex min-w-0 basis-16 grow flex-col items-center gap-1 px-2 text-center">
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
