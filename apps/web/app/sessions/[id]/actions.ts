"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  duplicateSession,
  insertPrescription,
  substitutePrescription,
} from "@/lib/sessions";
import { toDuplicateResult } from "@/lib/duplicate-session";
import type { AuthorPrescriptionInput } from "@/lib/hand-authored-session";

export interface SubstituteFormState {
  error: string | null;
}

export interface DuplicateFormState {
  error: string | null;
}

export interface InsertPrescriptionFormState {
  error: string | null;
}

// Append one hand-authored Exercise Prescription to the user's own standalone Session
// (Insert, ADR-0051, issue #360). The client has already mapped the "Add exercise" editor
// into the payload through the pure `buildInsertPrescriptionRequest` view-model, so this is a
// thin transport-and-revalidate shell. On success the Session page is revalidated so the new
// movement renders at the end in place (and shows up in the next Repeat/Start/Log); on failure
// — a Protocol-member target, an unknown exercise, or a `validate_deploy` rejection — the
// server's message is returned for the editor to surface, and nothing is persisted.
export async function submitInsertPrescription(
  sessionId: number,
  input: AuthorPrescriptionInput,
): Promise<InsertPrescriptionFormState> {
  const result = await insertPrescription(sessionId, input);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not add this exercise." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Duplicate this Session into a new standalone plan (ADR-0043). On success we redirect
// to the new copy so the user lands on the plan they can tweak and log; on failure —
// e.g. the source is not the user's own Session (404) — the error is returned for the
// button to surface. Duplicate is unlimited, so there is no spent state. `redirect`
// throws to navigate, so it runs after the write and outside any try/catch.
export async function submitDuplicate(
  _prevState: DuplicateFormState,
  form: FormData,
): Promise<DuplicateFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to duplicate." };
  }

  const result = toDuplicateResult(await duplicateSession(sessionId));
  if (!result.ok) {
    return { error: result.error };
  }

  redirect(result.href);
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
