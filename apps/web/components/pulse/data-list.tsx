import * as React from "react";

import { cn } from "@/lib/utils";

interface DataRow {
  label: React.ReactNode;
  value: React.ReactNode;
}

interface DataListProps {
  rows: DataRow[];
  className?: string;
}

// Label/value pairs (the pulse.pen "meta" grammar): a muted mono label on the
// left and the value on the right, one per row with hairline separators. Used
// for exercise and session detail metadata.
export function DataList({ rows, className }: DataListProps): React.JSX.Element {
  return (
    <dl className={cn("flex flex-col", className)}>
      {rows.map((row, index) => (
        <div
          key={index}
          className={cn(
            "flex items-baseline justify-between gap-4 py-2.5",
            index > 0 && "border-t border-border",
          )}
        >
          <dt className="label-mono text-[10px] text-text-muted">
            {row.label}
          </dt>
          <dd className="text-right font-sans text-sm font-medium text-text-primary">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
