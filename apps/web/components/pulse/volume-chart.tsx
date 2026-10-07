"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { useChartTheme } from "@/lib/use-chart-theme";
import { VOLUME_VALUES_CAPTION, type VolumeChartRow } from "@/lib/volume-view";
import { ChartValues } from "@/components/pulse/chart-values";

// The total-volume line chart (F3 Slice 5). A Client Component because Recharts needs the
// browser to measure and draw; the Analytics page (a Server Component) transforms the API
// series into `rows` and hands them down. One point per logged day, so the line reads as a
// sparse time series rather than a fabricated continuous curve.
//
// Recharts paints SVG stroke/fill with concrete strings, so the colours are resolved
// from the live theme via `useChartTheme` (ADR-0050) — the line tracks the Active
// Skin × Mode (cyan lead accent) instead of a frozen hex.
//
// The plot is paired with `ChartValues`, which renders the same `rows` as text (ADR-0084):
// the SVG has no per-point text and the tooltip opens only under a pointer, so without it
// the values are unreachable by keyboard. Both read one array, so they cannot disagree.
export function VolumeChart({ rows }: { rows: VolumeChartRow[] }) {
  const { cyan, muted, border } = useChartTheme();
  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* No accessibility layer: Recharts 3 would make the SVG an unnamed tab stop, and
              the values table below is how a keyboard reader gets the data (ADR-0084). */}
          <LineChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            accessibilityLayer={false}
          >
            <XAxis
              dataKey="label"
              tick={{ fill: muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: border }}
              minTickGap={16}
            />
            {/* Anchor the axis at zero (not the data min) so a near-flat tonnage series
                reads as flat rather than being auto-zoomed into a dramatic-looking cliff —
                the same refusal-to-exaggerate the Trend Delta honesty floor enforces. A
                fixed tick count keeps the scale monotonic and legible. */}
            <YAxis
              domain={[0, "auto"]}
              allowDecimals={false}
              tickCount={5}
              tick={{ fill: muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => `${Math.round(value)}`}
            />
            <Tooltip cursor={{ stroke: border }} content={VolumeTooltip} />
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
      <ChartValues
        caption={VOLUME_VALUES_CAPTION}
        labelHeading="DAY"
        valueHeading="TOTAL VOLUME"
        rows={rows.map((row) => ({
          key: row.date,
          label: row.dateText,
          value: row.valueText,
        }))}
      />
    </div>
  );
}

// A themed tooltip: the day and its total volume, matching the card surfaces rather than
// Recharts' default white box. Both strings come from the row, so the pointer and the
// values table state the same thing at the same precision — including the year, which a
// tooltip needs as much as the table does (the axis tick alone cannot place a point).
function VolumeTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload as VolumeChartRow;
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2 shadow-lg">
      <p className="label-mono text-[11px] text-text-muted">{row.dateText}</p>
      <p className="font-display text-sm font-semibold text-text-primary tabular-nums">
        {row.valueText}
      </p>
    </div>
  );
}
