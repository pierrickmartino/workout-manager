// The stat-header transform for the Exercise Detail screen (F6 Slice 2). This module
// has NO server-only imports, so it is safe to import from both Server and Client
// Components. The server-only data access (Clerk auth + fetch) lives in
// `lib/exercise-records.ts`.

// The API's per-exercise stat-header read model (ADR-0017): the Personal Record
// (highest Estimated 1RM in kg, or `null` when the Exercise has no absolute-Load
// history) and Total Sets (a count of the user's Logged Sets). `personal_record` is
// `null` — not 0 — for a bodyweight / qualitative / %-1RM / range Exercise, the signal
// to hide the tile rather than fabricate a zero. Later slices extend this shape.
export interface ExerciseRecords {
  exercise_id: number;
  exercise_name: string;
  personal_record: number | null;
  total_sets: number;
  top_set_series: TopSetPoint[];
}

// One qualifying session's Top Set (ADR-0017): the ISO `date` it was performed on and
// the best Estimated 1RM (kg) it reached. The series is oldest-first and capped to the
// last N sessions with no zero-padding, so a session with no absolute-Load set is simply
// absent — never a fabricated zero bar. Empty when the Exercise has no qualifying session.
export interface TopSetPoint {
  date: string;
  estimated_1rm: number;
}

// One headline tile: its mono `label` and display `value`, ready for the StatRow.
export interface StatTile {
  label: string;
  value: string;
}

// Decide which stat-header tiles render and format them. TOTAL SETS always renders —
// a count always exists. The PERSONAL RECORD tile renders only when the Exercise has a
// real Estimated 1RM (absolute-Load history), rounded to whole kilograms; for every
// other Exercise it is omitted, never shown as `0 kg` (ADR-0017). The strength tile is
// always labelled PERSONAL RECORD — never "personal best" for the raw heaviest load,
// which CONTEXT.md forbids. Pure and server-free.
export function toStatTiles(records: ExerciseRecords): StatTile[] {
  const tiles: StatTile[] = [];
  if (records.personal_record !== null) {
    tiles.push({
      label: "PERSONAL RECORD",
      value: `${Math.round(records.personal_record)} kg`,
    });
  }
  tiles.push({ label: "TOTAL SETS", value: `${records.total_sets}` });
  return tiles;
}
