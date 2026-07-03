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
  className?: string;
}

// Overline + display title, with an optional right-aligned action — the shared
// top-of-screen header pattern across every pulse.pen frame.
export function PageHeader({
  overline,
  title,
  action,
  className,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header
      className={cn("flex items-center justify-between gap-4", className)}
    >
      <div className="flex flex-col gap-1.5">
        <Overline>{overline}</Overline>
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-text-primary">
          {title}
        </h1>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
