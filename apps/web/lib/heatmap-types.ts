// Shared Training Heatmap types (#378, ADR-0054). This module has NO server-only
// imports, so it is safe to import from both Server and Client Components. The
// server-only data access (Clerk auth + fetch) lives in `lib/heatmap.ts`.

// One day in the mosaic, straight off the wire: its ISO `date`, grid position
// (`column` 0-based from the left, `row` 0 = Monday .. 6 = Sunday), how many Logged
// Sessions have this performed date (`session_count`, any Completion Outcome, plan-backed
// or plan-less alike), the summed attempted Logged Sets (`set_count`), and the
// fixed-threshold shade `level` (0 neutral, 1..4). A day with no session is neutral and
// empty — read as "nothing logged", never "missed".
export interface HeatmapCell {
  date: string;
  column: number;
  row: number;
  session_count: number;
  set_count: number;
  level: number;
}

// One rung of the fixed shade scale: the `level` and the `min_sets` that reach it. The
// backend emits the whole scale so the client renders the legend (less → more) without
// hardcoding the thresholds (ADR-0054).
export interface ShadeBucket {
  level: number;
  min_sets: number;
}

// The Training Heatmap payload: an ordered list of dated, shaded `cells` over the trailing
// ~53-week window, plus the fixed legend `scale`. A pure read-time projection of the
// user's Logged Sessions — a brand-new user projects to an all-neutral full-width frame.
export interface TrainingHeatmap {
  cells: HeatmapCell[];
  scale: ShadeBucket[];
}
