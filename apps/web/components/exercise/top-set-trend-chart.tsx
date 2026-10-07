"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { useChartTheme } from "@/lib/use-chart-theme";
import { TOP_SET_VALUES_CAPTION, type TopSetTrendRow } from "@/lib/top-set-trend-view";
import { ChartValues } from "@/components/pulse/chart-values";

interface TopSetTrendChartProps {
  rows: TopSetTrendRow[];
  // The chart body height. Defaults to the full `h-48` used on Exercise Detail; the
  // Strength Analytics small-multiples pass a shorter class so a grid of them stays
  // compact. Any other styling is unchanged, so the two surfaces read as one chart.
  heightClass?: string;
  // Whether the plot is paired with its `ChartValues` table (ADR-0084). On by default:
  // a chart owes its reader the values it plots. The one caller that passes `false` is
  // the Strength Analytics miniature, which is a *teaser* — hidden from the accessibility
  // tree and wrapped in a `<Link>` to the canonical chart (ADR-0024, CH-F4). A disclosure
  // there would be a focusable control inside `aria-hidden` and a `<details>` nested in an
  // `<a>`: an accessibility defect and invalid markup. That call site is registered, with
  // its reason, in `chart-values-policy.ts`'s exemption registry.
  showValues?: boolean;
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
  showValues = true,
}: TopSetTrendChartProps) {
  const { cyan, cyanDim, muted, border } = useChartTheme();
  return (
    <div>
      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          {/* No accessibility layer: Recharts 3 would make the SVG an unnamed tab stop, and
              inside the miniature's aria-hidden a focusable one (ADR-0084). */}
          <BarChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            accessibilityLayer={false}
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
            <Tooltip cursor={{ fill: cyanDim }} content={TrendTooltip} />
            <Bar
              dataKey="estimate"
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            >
              {/* Keyed on the row's series index, not its date: two Logged Sessions can be
                  performed on one date in a calendar-free app, and a duplicated key would
                  drop a bar. */}
              {rows.map((row) => (
                <Cell key={row.key} fill={row.isLatest ? cyan : cyanDim} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {showValues ? (
        <ChartValues
          caption={TOP_SET_VALUES_CAPTION}
          labelHeading="SESSION"
          valueHeading="EST. 1RM"
          rows={rows.map((row) => ({
            key: row.key,
            label: row.dateText,
            value: row.valueText,
          }))}
        />
      ) : null}
    </div>
  );
}

// A themed tooltip: the session date and its Top Set, matching the card surfaces rather
// than Recharts' default white box. Both strings come from the row, so the pointer and the
// values table state the same date — with its year — and the same estimate.
function TrendTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload as TopSetTrendRow;
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2 shadow-lg">
      <p className="label-mono text-[11px] text-text-muted">{row.dateText}</p>
      <p className="font-display text-sm font-semibold text-text-primary tabular-nums">
        {row.valueText}
      </p>
    </div>
  );
}
