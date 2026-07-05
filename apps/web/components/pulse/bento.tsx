import * as React from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// A responsive bento grid for the Analytics stat tiles. Two columns on mobile;
// tiles opt into a wider span via `span` for the pulse.pen bento rhythm.
export function Bento({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)} {...props} />
  );
}

interface BentoTileProps {
  // Muted mono label, e.g. "SESSIONS".
  label: string;
  // The headline number.
  value: React.ReactNode;
  // Optional cyan mono caption under the value, e.g. a unit or hint.
  caption?: string;
  // Let a tile stretch across both columns for the bento's hero cell.
  span?: "full";
  className?: string;
}

// One bento cell: a big display number over a muted mono label, on a card surface
// in the operator theme.
export function BentoTile({
  label,
  value,
  caption,
  span,
  className,
}: BentoTileProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        "flex flex-col gap-2 p-5",
        span === "full" ? "col-span-2" : undefined,
        className,
      )}
    >
      <span className="label-mono text-[9px] tracking-wider text-text-muted">
        {label}
      </span>
      <span className="font-display text-4xl font-bold leading-none text-text-primary">
        {value}
      </span>
      {caption ? (
        <span className="label-mono text-[9px] text-cyan">{caption}</span>
      ) : null}
    </Card>
  );
}
