// The stat-header transform for the Exercise Detail screen (F6 Slice 2). This module
// has NO server-only imports, so it is safe to import from both Server and Client
// Components. The server-only data access (Clerk auth + fetch) lives in
// `lib/exercise-records.ts`.

import type { PersonalRecordEntry } from "./analytics-types";
import { formatRecordAchievement } from "./record-achievement.ts";
import type { WeightUnit } from "./weight-unit";
import { formatWholeWeight } from "./weight-format.ts";

// The API's per-exercise stat-header read model (ADR-0017): the Personal Record
// (highest Estimated 1RM in kg, or `null` when the Exercise has no absolute-Load
// history) and Total Sets (a count of the user's Logged Sets). `personal_record` is
// `null` — not 0 — for a bodyweight / qualitative / %-1RM / range Exercise, the signal
// to hide the tile rather than fabricate a zero. `top_set_series` feeds the SPECS trend;
// `pr_milestones` feeds the RECORDS lens (F6 Slice 4): every PR-setting set newest-first,
// empty for an Exercise that can set no Personal Record.
export interface ExerciseRecords {
  exercise_id: number;
  exercise_name: string;
  personal_record: number | null;
  total_sets: number;
  top_set_series: TopSetPoint[];
  pr_milestones: PersonalRecordEntry[];
  // True when a bodyweight set is record-ineligible *only* because no Performed Body
  // Weight was on file (ADR-0026) — the signal to prompt the user to record their weight
  // so their calisthenics work can set records. `false` once any record exists.
  body_weight_nudge: boolean;
}

// One qualifying session's Top Set (ADR-0017): the ISO `date` it was performed on and
// the best Estimated 1RM (kg) it reached — an absolute set on its kilograms, or a
// bodyweight set resolved against its Performed Body Weight (ADR-0026), on the identical
// yardstick. The series is oldest-first and capped to the last N sessions with no
// zero-padding, so a session with no scorable set is simply absent — never a fabricated
// zero bar. Empty when the Exercise has no qualifying session.
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
// a count always exists. The PERSONAL RECORD tile renders whenever the Exercise has a
// record: an absolute record shows its whole-kg Estimated 1RM; a qualifying bodyweight
// record (ADR-0026) shows the set that achieved it — "bodyweight × 12" — from the newest
// milestone, never a fabricated kg figure. An Exercise with no record omits the tile,
// never shown as `0 kg` (ADR-0017). The tile is always labelled PERSONAL RECORD — never
// "personal best" for the raw heaviest load, which CONTEXT.md forbids. Pure and
// server-free.
export function toStatTiles(records: ExerciseRecords, unit: WeightUnit): StatTile[] {
  const tiles: StatTile[] = [];
  const personalRecord = personalRecordTile(records, unit);
  if (personalRecord !== null) {
    tiles.push(personalRecord);
  }
  tiles.push({ label: "TOTAL SETS", value: `${records.total_sets}` });
  return tiles;
}

// The PERSONAL RECORD tile, or `null` when the Exercise has no record to show. An
// absolute record uses the whole-kg headline; otherwise the newest PR milestone — the
// current record, since milestones strictly increase — supplies a bodyweight record's
// set descriptor. Records with no milestone at all (a movement that can set none) yield
// no tile, so it is hidden rather than zeroed.
function personalRecordTile(
  records: ExerciseRecords,
  unit: WeightUnit,
): StatTile | null {
  if (records.personal_record !== null) {
    return {
      label: "PERSONAL RECORD",
      value: formatWholeWeight(records.personal_record, unit),
    };
  }
  const currentRecord = records.pr_milestones[0];
  if (currentRecord) {
    return {
      label: "PERSONAL RECORD",
      value: formatRecordAchievement(currentRecord, unit),
    };
  }
  return null;
}
