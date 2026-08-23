import * as React from "react";

import type { HeatmapGrid } from "@/lib/heatmap-view";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TrainingHeatmapProps {
  // The column×row matrix and legend from `toHeatmapGrid`.
  grid: HeatmapGrid;
}

// The shade for each fixed level (0 neutral, 1..4), painted from the *existing* theme
// tokens (ADR-0054: reuse the chart/skin theming, no new color system). Neutral is the
// elevated surface — "nothing logged", never a shamed "missed" cell — and the non-zero
// levels are the cyan accent at rising opacity, so the mosaic tracks the Active Skin ×
// Light/Dark Mode automatically (the accent is a CSS custom property).
const LEVEL_SHADE: readonly string[] = [
  "bg-elevated",
  "bg-cyan/25",
  "bg-cyan/50",
  "bg-cyan/75",
  "bg-cyan",
];

function shadeFor(level: number): string {
  return LEVEL_SHADE[level] ?? LEVEL_SHADE[0];
}

// The legend swatches (less → more), driven by the API's fixed scale so nothing is
// hardcoded here (ADR-0054). The follow-up (#2) adds per-cell facts on hover and
// screen-reader labels; this renders the correctly-shaped, correctly-shaded grid.
function Legend({ grid }: TrainingHeatmapProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">LESS</span>
      {grid.legend.map((step) => (
        <span
          key={step.level}
          className={cn(
            "h-2.5 w-2.5 rounded-[2px] border border-border",
            shadeFor(step.level),
          )}
        />
      ))}
      <span className="label-mono text-[9px] text-text-muted">MORE</span>
    </div>
  );
}

// The Training Heatmap (#378, ADR-0054): a GitHub-style mosaic of the trailing ~53 weeks,
// one cell per day, Monday-aligned columns, each shaded by how much the user trained that
// day. A pure read-time projection of the Logged record — a brand-new user sees an
// all-neutral full-width frame, never an error. It is strictly *descriptive* record
// texture: no daily run, no daily streak; the weekly Streak stays the sole
// consecutiveness metric. Thin by design — the `grid` is pre-mapped by `toHeatmapGrid`;
// this component only renders. The frame scrolls horizontally on narrow screens so the
// stable full width never squeezes the cells or bleeds the page.
export function TrainingHeatmap({ grid }: TrainingHeatmapProps): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div
        className="overflow-x-auto"
        role="img"
        aria-label="Training Heatmap: daily training over the past year"
      >
        <div className="flex gap-1">
          {grid.columns.map((column) => (
            <div key={column.column} className="flex flex-col gap-1">
              {column.cells.map((cell) => (
                <span
                  key={cell.date}
                  className={cn(
                    "h-2.5 w-2.5 rounded-[2px] border border-border",
                    shadeFor(cell.level),
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Legend grid={grid} />
      </div>
    </Card>
  );
}
