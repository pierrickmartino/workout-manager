"use client";

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

// Prompt shown in the caption before any cell is hovered/focused — a plain guide, never a
// figure, so it introduces no consecutiveness wording.
const CAPTION_HINT = "Hover or focus a day for its detail";

function shadeFor(level: number): string {
  return LEVEL_SHADE[level] ?? LEVEL_SHADE[0];
}

// The legend swatches (less → more), driven by the API's fixed scale so nothing is
// hardcoded here (ADR-0054).
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
// consecutiveness metric. The frame scrolls horizontally on narrow screens so the stable
// full width never squeezes the cells or bleeds the page.
//
// Each cell carries its day's fact (#379) three ways so every user reads the same thing:
// an accessible name (`aria-label`, announced to screen-reader users on focus), a native
// hover tooltip (`title`), and — because a `title` never surfaces on keyboard focus and a
// floating tooltip would be clipped by the horizontal scroll — a shared caption below the
// grid that mirrors the hovered/focused cell for sighted mouse and keyboard users alike.
export function TrainingHeatmap({ grid }: TrainingHeatmapProps): React.JSX.Element {
  const [activeLabel, setActiveLabel] = React.useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* A labelled group, not role="img": role="img" would collapse the cells out of the
          accessibility tree, but each cell carries its own per-day fact as an accessible
          name (#379), so the mosaic must stay navigable. */}
      <div
        className="overflow-x-auto"
        role="group"
        aria-label="Training Heatmap: daily training over the past year"
      >
        <div className="flex gap-1">
          {grid.columns.map((column) => (
            <div key={column.column} className="flex flex-col gap-1">
              {column.cells.map((cell) => (
                <span
                  key={cell.date}
                  role="img"
                  aria-label={cell.label}
                  title={cell.label}
                  tabIndex={0}
                  onMouseEnter={() => setActiveLabel(cell.label)}
                  onMouseLeave={() => setActiveLabel(null)}
                  onFocus={() => setActiveLabel(cell.label)}
                  onBlur={() => setActiveLabel(null)}
                  className={cn(
                    "h-2.5 w-2.5 rounded-[2px] border border-border",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",
                    shadeFor(cell.level),
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        {/* The caption mirrors the focused/hovered cell for sighted users; screen readers
            already get the fact from each cell's aria-label, so it stays aria-hidden to
            avoid a double announcement. */}
        <span
          aria-hidden="true"
          className={cn(
            "min-w-0 truncate font-mono text-xs",
            activeLabel ? "text-text-primary" : "text-text-muted",
          )}
        >
          {activeLabel ?? CAPTION_HINT}
        </span>
        <Legend grid={grid} />
      </div>
    </Card>
  );
}
