"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/pulse/skeleton";

// `DistanceChart` behind a dynamic import — the one way a product surface is allowed to
// reach it (ADR-0090, enforced by `lib/recharts-import-policy.ts`). Same reasoning as
// `volume-chart-lazy.tsx`, and sharper here: Weekly Distance renders only for a user with
// distance work (`overview.distance.has_distance`), so a lifter who has never logged a run
// was paying for a chart the page then declined to draw.
export const DistanceChartLazy = dynamic(
  () => import("@/components/pulse/distance-chart").then((m) => m.DistanceChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
