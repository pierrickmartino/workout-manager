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

import { useChartTheme } from "@/lib/use-chart-theme";
import type { TopSetTrendRow } from "@/lib/top-set-trend-view";

interface TopSetTrendChartProps {
  rows: TopSetTrendRow[];
  // The chart body height. Defaults to the full `h-48` used on Exercise Detail; the
  // Strength Analytics small-multiples pass a shorter class so a grid of them stays
  // compact. Any other styling is unchanged, so the two surfaces read as one chart.
  heightClass?: string;
}

// The Top-Set Trend bar chart (F6 Slice 3): one bar per qualifying session, the best
// Estimated 1RM it reached, on the same yardstick as the Personal Record tile
// (ADR-0017). A Client Component because Recharts needs the browser to measure and
// draw; the SPECS panel (a Server Component) transforms the API series into `rows` and
// hands them down. The most-recent bar is highlighted so the eye lands on the latest
// state. Callers render this only for a non-empty series, so there is no empty branch.
//
// Recharts paints SVG fill with concrete strings, so the colours resolve from the
// live theme via `useChartTheme` (ADR-0050) — the chart tracks the Active Skin ×
// Mode. The most recent session's bar wears the lead cyan accent; the earlier bars
// sit back in the translucent `cyan-dim` token so the trend reads toward "now".
export function TopSetTrendChart({
  rows,
  heightClass = "h-48",
}: TopSetTrendChartProps) {
  const { cyan, cyanDim, muted, border } = useChartTheme();
  return (
    <div className={`${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: border }}
            minTickGap={8}
          />
          <YAxis
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={["dataMin - 10", "dataMax + 5"]}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Tooltip
            cursor={{ fill: cyanDim }}
            content={<TrendTooltip />}
          />
          <Bar
            dataKey="estimate"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          >
            {rows.map((row) => (
              <Cell key={row.date} fill={row.isLatest ? cyan : cyanDim} />
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
