"use client";

import dynamic from "next/dynamic";

import type { TopSetTrendRow } from "@/lib/top-set-trend-view";
import { Skeleton } from "@/components/pulse/skeleton";

// `TopSetTrendChart` behind a dynamic import — the one way a product surface is allowed to
// reach it (ADR-0088, enforced by `lib/recharts-import-policy.ts`).
//
// This is the sharpest of the three cases. Both call sites already early-return `null` when
// there is nothing to plot: the SPECS panel hides the chart for a bodyweight or never-logged
// Exercise, and Strength Trajectories hides the whole grid for a user with no qualifying
// lifts. It also draws nothing on Exercise Detail's HISTORY and RECORDS tabs. But a static
// import is unconditional, so every visit to every tab of `/exercises/[id]` — a browse
// surface reached from six origins, on a mobile-first PWA — carried ~102 KB gzipped of
// charting library for a chart most of those visits never draw.
//
// ADR-0084 still holds: `ChartValues` ships inside `TopSetTrendChart` from the same rows, so
// the table mounts wherever the plot does. The one call site that suppresses it
// (`showValues={false}`, the Strength Analytics teaser) is registered with its reason in
// `chart-values-policy.ts` and is unaffected by how the module is loaded.

// The plot body's height, as a closed set rather than a free string, so each declared height
// can have a placeholder at exactly that height. `next/dynamic`'s `loading` is a component,
// not a function of props — it cannot read `heightClass` — so a single fixed skeleton would
// shift the `h-28` miniature by 20 rows' worth on arrival, in a grid of them. One entry per
// declared height holds the plot body's box instead; both entries name the same specifier, so
// the bundler emits one shared chunk. The `ChartValues` disclosure below the plot is not
// reserved and still shifts by a line — smaller than what this prevents, and not nothing.
export type TopSetTrendHeight = "h-48" | "h-28";

function lazyChartAt(heightClass: TopSetTrendHeight) {
  return dynamic(
    () => import("@/components/exercise/top-set-trend-chart").then((m) => m.TopSetTrendChart),
    { ssr: false, loading: () => <Skeleton className={`${heightClass} w-full`} /> },
  );
}

const CHART_BY_HEIGHT: Readonly<Record<TopSetTrendHeight, ReturnType<typeof lazyChartAt>>> = {
  "h-48": lazyChartAt("h-48"),
  "h-28": lazyChartAt("h-28"),
};

interface TopSetTrendChartLazyProps {
  rows: TopSetTrendRow[];
  // Defaults to the full height used on Exercise Detail; the Strength Analytics
  // small-multiples pass the shorter one so a grid of them stays compact.
  heightClass?: TopSetTrendHeight;
  // Whether the plot is paired with its `ChartValues` table (ADR-0084). On by default; see
  // `top-set-trend-chart.tsx` for the one registered call site that opts out.
  showValues?: boolean;
}

export function TopSetTrendChartLazy({
  rows,
  heightClass = "h-48",
  showValues,
}: TopSetTrendChartLazyProps): React.JSX.Element {
  const Chart = CHART_BY_HEIGHT[heightClass];
  return <Chart rows={rows} heightClass={heightClass} showValues={showValues} />;
}
