"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type { DistanceChartRow } from "@/lib/distance-view";

// The operator-theme palette, resolved to concrete values because Recharts styles
// SVG fill directly rather than through Tailwind classes. Kept in sync with the tokens
// in globals.css. Distance uses the violet accent so it reads as a distinct axis from
// the cyan Total Volume line — different colour, different thing.
const VIOLET = "#9a6bff";
const MUTED = "#71717a";
const BORDER = "#27272a";

// The Weekly Distance bar chart (ADR-0049): one bar per Monday-anchored week, height in
// kilometres. A Client Component because Recharts needs the browser to measure and draw;
// the Analytics page (a Server Component) transforms the API series into `rows` and hands
// them down. Bars — not a line — because weeks are discrete buckets, not a continuous curve.
export function DistanceChart({ rows }: { rows: DistanceChartRow[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: BORDER }}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Tooltip cursor={{ fill: BORDER, fillOpacity: 0.3 }} content={<DistanceTooltip />} />
          <Bar
            dataKey="km"
            fill={VIOLET}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// A themed tooltip: the week and its total distance in kilometres, matching the card
// surfaces rather than Recharts' default white box.
function DistanceTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload as DistanceChartRow;
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2 shadow-lg">
      <p className="label-mono text-[11px] text-text-muted">Week of {row.label}</p>
      <p className="font-display text-sm font-semibold text-text-primary tabular-nums">
        {row.km} km
      </p>
    </div>
  );
}
