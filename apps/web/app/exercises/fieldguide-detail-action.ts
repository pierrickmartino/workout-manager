"use server";

// PROTOTYPE — Field Guide exercise discovery. Throwaway; see
// components/exercise-fieldguide-prototype/README.md.
//
// The single READ-ONLY server action behind the field-guide Details surface: it fetches
// the full Exercise detail (instructions, alternatives, variations) and the record-side
// figures (Personal Record, Total Sets) in parallel when the user opens Details, so the
// browse variants stay light and never mutate a plan. A pure wrapper over the existing
// `fetchExercise` / `fetchExerciseRecords` readers — the JWT-attaching reads stay on the
// server; the client only holds already-unwrapped data.

import { fetchExercise } from "@/lib/sessions";
import { fetchExerciseRecords } from "@/lib/exercise-records";
import type { ExerciseDetail } from "@/lib/sessions-types";
import type { ExerciseRecords } from "@/lib/exercise-stats-view";

export interface FieldGuideDetail {
  exercise: ExerciseDetail | null;
  records: ExerciseRecords | null;
  error: string | null;
}

export async function fetchFieldGuideDetail(
  exerciseId: number,
): Promise<FieldGuideDetail> {
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
    // than failing the whole panel (mirrors the production Detail page).
    records:
      recordsEnvelope.success && recordsEnvelope.data ? recordsEnvelope.data : null,
    error: null,
  };
}
