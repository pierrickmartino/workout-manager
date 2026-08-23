import type { TrainingHeatmap } from "./heatmap-types";

// One cell prepared for the mosaic: its ISO `date` (kept as the render key, and the
// hook for the hover facts / screen-reader labels landing in the follow-up) and its
// fixed-threshold shade `level` (0 neutral, 1..4).
export interface HeatmapCellView {
  date: string;
  level: number;
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

// Turn the API's ordered cell list into the column×row matrix the mosaic renders. Cells
// arrive ascending by date (column-major), but we group and sort defensively so the
// matrix is correct regardless of wire order. An empty history is an all-neutral frame;
// no cells at all yields an empty column list rather than throwing — the caller decides
// how to present that.
export function toHeatmapGrid(heatmap: TrainingHeatmap): HeatmapGrid {
  const byColumn = new Map<number, HeatmapCellView[]>();
  for (const cell of heatmap.cells) {
    const cells = byColumn.get(cell.column) ?? [];
    cells.push({ date: cell.date, level: cell.level });
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
