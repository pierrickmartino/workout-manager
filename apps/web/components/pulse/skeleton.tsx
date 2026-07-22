import * as React from "react";

import { cn } from "@/lib/utils";

// The shared loading placeholder for pulse screens. A muted, softly pulsing
// block that stands in for content while an async Server Component fetches
// (ADR-0028: skeletons over spinners). Compose these into a route's loading.tsx
// so the placeholder matches the final layout's dimensions — a skeleton that
// mismatches the rendered size trades a perceived-perf win for a CLS regression.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-elevated/70",
        className,
      )}
      {...props}
    />
  );
}

// A run of skeleton text lines. The last line is shortened so the block reads as
// a paragraph rather than a solid rectangle. `lines` defaults to a short block.
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
