"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type { TopSetTrendRow } from "@/lib/top-set-trend-view";

// The operator-theme palette, resolved to concrete values because Recharts styles SVG
// fill directly rather than through Tailwind classes. Kept in sync with the tokens in
// globals.css. The most recent session's bar wears the cyan accent; the earlier bars
// sit back in a dim cyan so the trend reads toward "now".
const CYAN = "#29e7e0";
const CYAN_DIM = "#164e4b";
const MUTED = "#71717a";
const BORDER = "#27272a";

interface TopSetTrendChartProps {
  rows: TopSetTrendRow[];
}

// The Top-Set Trend bar chart (F6 Slice 3): one bar per qualifying session, the best
// Estimated 1RM it reached, on the same yardstick as the Personal Record tile
// (ADR-0017). A Client Component because Recharts needs the browser to measure and
// draw; the SPECS panel (a Server Component) transforms the API series into `rows` and
// hands them down. The most-recent bar is highlighted so the eye lands on the latest
// state. Callers render this only for a non-empty series, so there is no empty branch.
export function TopSetTrendChart({ rows }: TopSetTrendChartProps) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: BORDER }}
            minTickGap={8}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={["dataMin - 10", "dataMax + 5"]}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Tooltip cursor={{ fill: "rgba(41, 231, 224, 0.06)" }} content={<TrendTooltip />} />
          <Bar dataKey="estimate" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.date} fill={row.isLatest ? CYAN : CYAN_DIM} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// A themed tooltip: the session date and its Top Set in whole kilograms, matching the
// card surfaces rather than Recharts' default white box.
function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload as TopSetTrendRow;
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2 shadow-lg">
      <p className="label-mono text-[11px] text-text-muted">{row.label}</p>
      <p className="font-display text-sm font-semibold text-text-primary tabular-nums">
        {Math.round(row.estimate)} kg
      </p>
    </div>
  );
}
