"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { useChartTheme } from "@/lib/use-chart-theme";
import type { VolumeChartRow } from "@/lib/volume-view";
import type { WeightUnit } from "@/lib/weight-unit";
import { weightUnitLabel } from "@/lib/weight-format";

// The total-volume line chart (F3 Slice 5). A Client Component because Recharts needs
// the browser to measure and draw; the Analytics page (a Server Component) transforms
// the API series into `rows` and hands them down. One point per logged day, so the
// line reads as a sparse time series rather than a fabricated continuous curve.
//
// Recharts paints SVG stroke/fill with concrete strings, so the colours are resolved
// from the live theme via `useChartTheme` (ADR-0050) — the line tracks the Active
// Skin × Mode (cyan lead accent) instead of a frozen hex.
export function VolumeChart({
  rows,
  unit,
}: {
  rows: VolumeChartRow[];
  unit: WeightUnit;
}) {
  const { cyan, muted, border } = useChartTheme();
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: border }}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Tooltip
            cursor={{ stroke: border }}
            content={<VolumeTooltip unit={unit} />}
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke={cyan}
            strokeWidth={2}
            dot={{ r: 2, fill: cyan, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: cyan, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// A themed tooltip: the day and its total volume as a whole figure in the reader's Weight
// Unit, matching the card surfaces rather than Recharts' default white box. The row `volume`
// is already projected to the reader's unit; only the label is appended.
function VolumeTooltip({
  active,
  payload,
  unit,
}: TooltipProps<number, string> & { unit: WeightUnit }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload as VolumeChartRow;
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2 shadow-lg">
      <p className="label-mono text-[11px] text-text-muted">{row.label}</p>
      <p className="font-display text-sm font-semibold text-text-primary tabular-nums">
        {Math.round(row.volume)} {weightUnitLabel(unit)}
      </p>
    </div>
  );
}
