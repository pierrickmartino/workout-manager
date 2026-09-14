"use server";

import { revalidatePath } from "next/cache";

import {
  setAdminExercisePrecautions,
  setAdminExerciseProvenance,
  updateAdminExercise,
} from "@/lib/admin-exercises";
import type { ExercisePatchPayload } from "@/lib/admin-exercise-editor";
import type { ExerciseDetail } from "@/lib/sessions-types";

// The thin server action behind the admin Exercise editor (issue #502). It exists because
// the `PATCH /api/exercises/{id}` endpoint is admin-gated and JWT-authenticated server-side
// (the token never reaches the browser), so the Client Component drives the write through
// here. The backend enforces `require_admin` and the name-collision rule — this is not a
// place to re-check either — and this unwraps the envelope to a `{ exercise, error }` the
// editor renders, surfacing the 409 collision message straight from `error`.
export interface UpdateExerciseResult {
  exercise: ExerciseDetail | null;
  error: string | null;
}

export async function updateExerciseAction(
  id: number,
  patch: Partial<ExercisePatchPayload>,
): Promise<UpdateExerciseResult> {
  const result = await updateAdminExercise(id, patch);
  if (!result.success || !result.data) {
    return { exercise: null, error: result.error ?? "Could not save the exercise." };
  }

  // A descriptive edit changes the catalog browser row, this editor, and the public
  // Exercise Detail page, so drop their cached renders.
  revalidatePath("/admin/exercises");
  revalidatePath(`/admin/exercises/${id}`);
  revalidatePath(`/exercises/${id}`);
  return { exercise: result.data, error: null };
}

// Drop the cached renders an admin write touches: the catalog browser row, this editor (its
// audit trail changes on a provenance change), and the public Exercise Detail page.
function revalidateExercise(id: number): void {
  revalidatePath("/admin/exercises");
  revalidatePath(`/admin/exercises/${id}`);
  revalidatePath(`/exercises/${id}`);
}

// Deliberately set the Exercise's Provenance (issue #503, ADR-0075). The backend is the gate:
// it enforces `require_admin`, rejects an invalid tier (422), and writes the audit record — this
// only forwards the value and unwraps the envelope. A distinct act from the descriptive save.
export async function setProvenanceAction(
  id: number,
  provenance: string,
): Promise<UpdateExerciseResult> {
  const result = await setAdminExerciseProvenance(id, provenance);
  if (!result.success || !result.data) {
    return {
      exercise: null,
      error: result.error ?? "Could not change the provenance.",
    };
  }
  revalidateExercise(id);
  return { exercise: result.data, error: null };
}

// Write the Exercise's curator-only precautions (issue #503, spec §5). The backend trims and
// HTML-escapes each entry at its write boundary; this forwards the plain-text list and unwraps
// the envelope. Separate from the descriptive save and never audited.
export async function setPrecautionsAction(
  id: number,
  precautions: string[],
): Promise<UpdateExerciseResult> {
  const result = await setAdminExercisePrecautions(id, precautions);
  if (!result.success || !result.data) {
    return {
      exercise: null,
      error: result.error ?? "Could not save the precautions.",
    };
  }
  revalidateExercise(id);
  return { exercise: result.data, error: null };
}
