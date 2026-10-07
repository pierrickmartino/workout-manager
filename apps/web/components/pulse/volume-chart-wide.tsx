"use client";

import type { VolumeChartRow } from "@/lib/volume-view";
import { useWideViewport } from "@/lib/use-wide-viewport";
import { VolumeChartLazy } from "@/components/pulse/volume-chart-lazy";

// `VolumeChart` for a block that exists only at the shell's wide width (ADR-0088). Two
// things are needed to keep its cost off a phone, and neither is optional:
//
//   1. **A dynamic import.** A static import puts Recharts in the route's client chunk graph
//      whether or not the component ever renders. Measured on `/dashboard`: 2 chunks, 402 KB
//      raw / **110 KB gzipped**, against the ~10 KB budget ADR-0088 sets — 11× over (#576
//      review). That now lives in `VolumeChartLazy`, which every surface shares, so the
//      dynamic boundary is declared once per chart rather than once per call site.
//   2. **A mount gate.** `hidden lg:flex` hides a subtree but still renders and hydrates it,
//      so CSS alone would still fetch the chunk on a phone. `useWideViewport` decides whether
//      to mount at all, over the same 64rem threshold the CSS uses. This is what the lazy
//      wrapper alone does *not* give you: `next/dynamic` defers the fetch, it does not cancel
//      it, so without this gate a phone would still pay for a block it cannot see.
//
// The rows still come from the server render, so this adds no client fetch and no route
// handler: it was the *JavaScript* that blew the budget, not the data.
//
// ADR-0084 still holds. Its guarantee is that every **plotted** datum is retrievable as text,
// and `ChartValues` ships inside `VolumeChart` from the same rows — so wherever the plot
// exists the table exists beside it, and where neither is mounted there is no datum to reach.
export function VolumeChartWide({
  rows,
}: {
  rows: VolumeChartRow[];
}): React.JSX.Element | null {
  const isWide = useWideViewport();
  if (!isWide) return null;
  return <VolumeChartLazy rows={rows} />;
}
