"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/pulse/skeleton";

// `VolumeChart` behind a dynamic import — the one way a product surface is allowed to reach
// it (ADR-0090, enforced by `lib/recharts-import-policy.ts`). A static import puts Recharts
// in the route's client chunk graph whether or not the chart ever renders; ADR-0090 carries
// the before/after measurements.
//
// `ssr: false` because Recharts needs the browser to measure and draw anyway, so a server
// render of it is wasted bytes twice over. The rows still come from the server render, so
// this adds no client fetch and no route handler: it was the *JavaScript* that blew the
// budget, not the data. The skeleton stands in at the plot's own height, so the plot body
// holds its box across the swap (ADR-0028: skeletons over spinners). It does not reserve the
// `ChartValues` disclosure, which is one mono summary line and a margin below the plot — that
// much still shifts, and pretending otherwise would be the easier comment to write.
//
// ADR-0084 still holds. Its guarantee is that every **plotted** datum is retrievable as
// text, and `ChartValues` ships inside `VolumeChart` from the same rows — so wherever the
// plot mounts the table mounts beside it, and where neither mounts there is no plotted datum
// to make retrievable. Deferring *when* the module loads cannot separate the two, because
// they are the same module.
export const VolumeChartLazy = dynamic(
  () => import("@/components/pulse/volume-chart").then((m) => m.VolumeChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
