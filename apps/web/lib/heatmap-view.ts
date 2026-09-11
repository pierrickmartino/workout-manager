import type { TrainingHeatmap } from "./heatmap-types";
import { formatShortDate } from "./date-format.ts";

// One cell prepared for the mosaic: its ISO `date` (kept as the render key), its
// fixed-threshold shade `level` (0 neutral, 1..4), and the per-cell `label` — the day's
// fact ("Mar 4 · 2 sessions · 14 sets", or "Mar 4 · no training logged" for an empty
// day) that the component wires as both the hover/focus tooltip and the accessible name
// so keyboard and screen-reader users read the same fact sighted hover users do (#379,
// ADR-0054). The wording is strictly a per-cell fact — never a run or "in a row" phrase,
// so the descriptive-only boundary holds at the interaction layer.
export interface HeatmapCellView {
  date: string;
  level: number;
  label: string;
}

// One week column: its 0-based `column` index from the left and its seven cells, ordered
// row 0 (Monday) .. 6 (Sunday), top-to-bottom.
export interface HeatmapColumnView {
  column: number;
  cells: HeatmapCellView[];
}

// One rung of the legend (less → more), read straight off the API's fixed scale so the
// component never hardcodes the thresholds.
export interface HeatmapLegendStep {
  level: number;
  minSets: number;
}

// The Training Heatmap prepared for rendering: the week `columns` left-to-right and the
// `legend` steps. Pure and server-free, like the other view helpers.
export interface HeatmapGrid {
  columns: HeatmapColumnView[];
  legend: HeatmapLegendStep[];
}

// "1 session"/"2 sessions" — count with a correctly singular/plural noun.
function countPhrase(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// The per-cell fact (#379): a populated day reads "Mar 4 · 2 sessions · 14 sets" (date ·
// session count · attempted-set count); an empty day reads "Mar 4 · no training logged",
// plainly neutral — never "missed", and never a daily-run/streak phrase (the weekly
// Streak stays the sole consecutiveness figure, ADR-0054). "Populated" is having any
// Logged Session that day; a day with sessions but no attempted sets still reads as
// training logged.
function cellLabel(date: string, sessionCount: number, setCount: number): string {
  const day = formatShortDate(date);
  if (sessionCount <= 0) {
    return `${day} · no training logged`;
  }
  return `${day} · ${countPhrase(sessionCount, "session")} · ${countPhrase(setCount, "set")}`;
}

// Turn the API's ordered cell list into the column×row matrix the mosaic renders. Cells
// arrive ascending by date (column-major), but we group and sort defensively so the
// matrix is correct regardless of wire order. An empty history is an all-neutral frame;
// no cells at all yields an empty column list rather than throwing — the caller decides
// how to present that.
export function toHeatmapGrid(heatmap: TrainingHeatmap): HeatmapGrid {
  const byColumn = new Map<number, HeatmapCellView[]>();
  for (const cell of heatmap.cells) {
    const cells = byColumn.get(cell.column) ?? [];
    cells.push({
      date: cell.date,
      level: cell.level,
      label: cellLabel(cell.date, cell.session_count, cell.set_count),
    });
    byColumn.set(cell.column, cells);
  }

  const columns = [...byColumn.entries()]
    .sort(([a], [b]) => a - b)
    .map(([column, cells]) => ({
      column,
      // The row index is encoded by weekday order; re-sort by date so Monday..Sunday
      // reads top-to-bottom even if the wire order is disturbed.
      cells: [...cells].sort((a, b) => a.date.localeCompare(b.date)),
    }));

  const legend = heatmap.scale
    .map((bucket) => ({ level: bucket.level, minSets: bucket.min_sets }))
    .sort((a, b) => a.level - b.level);

  return { columns, legend };
}
