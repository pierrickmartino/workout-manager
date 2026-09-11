// The single source of truth for how a Personal Record's headline reads. NO server-only
// imports, so it is safe from both Server and Client Components and unit-testable in
// isolation. Every PR surface (the stat header tile, the RECORDS lens, the all-time PR
// timeline, Home's Latest PR) formats through here so a record reads the same everywhere.

import type { WeightUnit } from "./weight-unit";
import { formatWeight, formatWholeWeight } from "./weight-format.ts";

// The fields a Personal Record needs to render its achievement — the subset shared by the
// analytics `PersonalRecordEntry`, the stat-header milestone, and Home's Latest PR.
export interface RecordAchievement {
  // The within-Exercise Estimated 1RM (kg). Shown as the headline for an absolute record;
  // for a bodyweight record it only orders the record and is never displayed as kg.
  estimated_1rm: number;
  // The reps performed — the headline for a bodyweight record.
  reps: number;
  // Whether the record was set on a bodyweight Load (ADR-0026).
  is_bodyweight: boolean;
  // Any added load on a bodyweight set (a belt / vest), in kg; `null` for a pure
  // bodyweight set and for an absolute record.
  added_kg: number | null;
}

// Format a Personal Record's headline honestly (ADR-0026), in the reader's Weight Unit. An
// absolute record shows its Estimated 1RM rounded to a whole figure in that unit — a shared
// magnitude comparable across barbell lifts. A bodyweight record shows the *set that achieved
// it* — "bodyweight × 12" or "bodyweight + 20 kg × 5" — never a bare mass figure: full body
// weight is an unreliable absolute across movements, so the estimate only orders records within
// one Exercise and must never surface as a cross-movement headline. The *added* load on a
// weighted bodyweight set is a real weight, so it is projected to the reader's unit like every
// other Load (#417).
export function formatRecordAchievement(
  record: RecordAchievement,
  unit: WeightUnit,
): string {
  if (!record.is_bodyweight) {
    return formatWholeWeight(record.estimated_1rm, unit);
  }
  const added = record.added_kg;
  const base =
    added && added > 0 ? `bodyweight + ${formatWeight(added, unit)}` : "bodyweight";
  return `${base} × ${record.reps}`;
}
