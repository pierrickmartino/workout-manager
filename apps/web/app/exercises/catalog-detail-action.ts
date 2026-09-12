"use server";

// The read-only Server Action behind the field-guide Details drawer (ADR-0072): when the
// user opens an exercise from the taxonomy it fetches the full catalog detail (how-to,
// alternatives) and the record-side figures (Personal Record, Total Sets) in parallel, so
// the browse stays light and the drawer never blocks the list. A pure wrapper over the
// existing `fetchExercise` / `fetchExerciseRecords` readers — the JWT-attaching reads stay
// on the server and nothing here edits a plan.

import { fetchExercise } from "@/lib/sessions";
import { fetchExerciseRecords } from "@/lib/exercise-records";
import type { ExerciseDetail } from "@/lib/sessions-types";
import type { ExerciseRecords } from "@/lib/exercise-stats-view";

export interface CatalogEntryDetail {
  exercise: ExerciseDetail | null;
  records: ExerciseRecords | null;
  error: string | null;
}

export async function fetchCatalogEntryDetail(
  exerciseId: number,
): Promise<CatalogEntryDetail> {
  const [detailEnvelope, recordsEnvelope] = await Promise.all([
    fetchExercise(exerciseId),
    fetchExerciseRecords(exerciseId),
  ]);

  if (!detailEnvelope.success || !detailEnvelope.data) {
    return {
      exercise: null,
      records: null,
      error: detailEnvelope.error ?? "Could not load this exercise.",
    };
  }

  return {
    exercise: detailEnvelope.data,
    // The record side is best-effort: a failed read just omits past performance rather
    // than failing the whole panel (mirrors the production Exercise Detail page).
    records:
      recordsEnvelope.success && recordsEnvelope.data ? recordsEnvelope.data : null,
    error: null,
  };
}
