"use server";

import { revalidatePath } from "next/cache";

import { substitutePrescription } from "@/lib/sessions";

export interface SubstituteFormState {
  error: string | null;
}

// Swap one prescribed Exercise on the user's own Session copy. On success the
// Session page is revalidated so the new movement renders in place; the swap is
// unlimited and distinct from Regeneration.
export async function submitSubstitute(
  _prevState: SubstituteFormState,
  form: FormData,
): Promise<SubstituteFormState> {
  const sessionId = Number(form.get("session_id"));
  const position = Number(form.get("position"));
  if (!Number.isInteger(sessionId) || !Number.isInteger(position)) {
    return { error: "Could not determine which exercise to substitute." };
  }

  const result = await substitutePrescription(sessionId, position);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not substitute this exercise." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Accept the harder-Variation offer at the pure-bodyweight rep ceiling (#202):
// advance this prescription's movement to the suggested Variation through the same
// user-initiated Substitution flow, carrying its `target_exercise_id`. Declining is
// a client-only dismissal that never reaches here, so no write happens on decline.
export async function submitAdvanceVariation(
  _prevState: SubstituteFormState,
  form: FormData,
): Promise<SubstituteFormState> {
  const sessionId = Number(form.get("session_id"));
  const position = Number(form.get("position"));
  const targetExerciseId = Number(form.get("target_exercise_id"));
  if (
    !Number.isInteger(sessionId) ||
    !Number.isInteger(position) ||
    !Number.isInteger(targetExerciseId)
  ) {
    return { error: "Could not determine which Variation to advance to." };
  }

  const result = await substitutePrescription(
    sessionId,
    position,
    targetExerciseId,
  );
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not advance to this Variation." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}
