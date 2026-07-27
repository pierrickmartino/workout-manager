"use server";

import { revalidatePath } from "next/cache";

import { buildOutcomeCorrection } from "@/lib/log-correction";
import { correctSession, deleteSession, fetchHistory } from "@/lib/logs";
import type { CompletionOutcome } from "@/lib/logs-types";

export interface DeleteLogState {
  error: string | null;
}

// Delete a mis-logged Logged Session (ADR-0034). The server is authoritative: it resolves
// ownership (`404`) and runs the contiguity gate (`409` when the delete would leave a gap
// in the performed sequence), so a rejection surfaces its message here even though the
// History control is also disabled client-side for the common case. On success the history
// is revalidated so the record — and every projection derived from it — disappears.
export async function deleteLogAction(
  _prevState: DeleteLogState,
  form: FormData,
): Promise<DeleteLogState> {
  const logId = Number(form.get("log_id"));
  if (!Number.isInteger(logId)) {
    return { error: "Could not tell which log to delete." };
  }

  const result = await deleteSession(logId);
  if (!result.success) {
    return { error: result.error ?? "Could not delete this record." };
  }

  revalidatePath("/history");
  return { error: null };
}

export interface ToggleOutcomeState {
  error: string | null;
}

// Correct a plan-backed Logged Session's Completion Outcome from the History screen
// (ADR-0034). The toggle sends only the target outcome; the record's current contents are
// re-read here (the JWT never reaches the browser) and re-sent unchanged as a full-replace
// PUT. The server is authoritative: it re-vets a flip to Incomplete through the contiguity
// gate (`409` when it would leave a gap), even though the un-complete control is also
// disabled client-side for the common case. On success the history — and every projection
// derived from it (advancement / Next Session, XP, Streak, Achievements) — is revalidated.
export async function toggleOutcomeAction(
  _prevState: ToggleOutcomeState,
  form: FormData,
): Promise<ToggleOutcomeState> {
  const logId = Number(form.get("log_id"));
  if (!Number.isInteger(logId)) {
    return { error: "Could not tell which log to update." };
  }

  const outcome = form.get("outcome");
  if (outcome !== "completed" && outcome !== "incomplete") {
    return { error: "Could not tell which outcome to set." };
  }

  const envelope = await fetchHistory();
  if (!envelope.success || !envelope.data) {
    return { error: envelope.error ?? "Could not load your history." };
  }
  const record = envelope.data.find((entry) => entry.id === logId);
  if (record === undefined) {
    return { error: "That record is no longer available." };
  }

  const built = buildOutcomeCorrection(record, outcome as CompletionOutcome);
  if (!built.ok) {
    return { error: built.error };
  }

  const result = await correctSession(logId, built.request);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not update the outcome." };
  }

  revalidatePath("/history");
  return { error: null };
}
