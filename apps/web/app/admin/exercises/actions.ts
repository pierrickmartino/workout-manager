"use server";

import { revalidatePath } from "next/cache";

import { updateAdminExercise } from "@/lib/admin-exercises";
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
