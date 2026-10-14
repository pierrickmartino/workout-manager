import * as React from "react";

import { cn } from "@/lib/utils";
import { Overline } from "@/components/pulse/overline";

interface PageHeaderProps {
  // The cyan mono overline, e.g. "PULSE // DASHBOARD".
  overline: string;
  // The large display title, e.g. "Your Fitness Profile".
  title: React.ReactNode;
  // Optional element rendered on the right (avatar, gear button, badge).
  action?: React.ReactNode;
  // Optional icon-only control (a ⋯ action sheet trigger) pinned to the top-right corner, on the
  // overline's line, so it never takes width from the title (ADR-0133).
  menu?: React.ReactNode;
  className?: string;
}

// Overline + display title, with an optional right-aligned action — the shared
// top-of-screen header pattern across every pulse.pen frame.
export function PageHeader({
  overline,
  title,
  action,
  menu,
  className,
}: PageHeaderProps): React.JSX.Element {
  return (
    // The action wraps to its own line when it genuinely does not fit beside the title, and
    // stays inline everywhere it does (ADR-0085). It used to be `shrink-0` in a non-wrapping
    // row, so an action cluster wider than the leftover space pushed the whole document past
    // the viewport — History's link-plus-badge did exactly that at 320px, in every Skin and
    // Mode, whatever the record names were. A wrapped action sits at the start of its line,
    // under the title it belongs to.
    <header
      className={cn("flex flex-wrap items-center justify-between gap-4", className)}
    >
      {/* With a menu the title column spans the header: the menu rides the overline's line
          (negative margins keep its 40px tap target from growing that line), so the title runs
          the full width instead of sharing it with a column the menu would hold all the way down. */}
      <div className={cn("flex min-w-0 flex-col gap-1.5", menu && "w-full")}>
        {menu ? (
          <div className="flex items-center justify-between gap-3">
            <Overline>{overline}</Overline>
            <div className="-my-3 -mr-2 shrink-0">{menu}</div>
          </div>
        ) : (
          <Overline>{overline}</Overline>
        )}
        <h1 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight text-text-primary">
          {title}
        </h1>
      </div>
      {action ? <div className="min-w-0">{action}</div> : null}
    </header>
  );
}
