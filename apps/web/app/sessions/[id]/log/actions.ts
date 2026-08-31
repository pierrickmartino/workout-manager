"use server";

import { revalidatePath } from "next/cache";

import { logSession } from "@/lib/logs";
import type { CompletionOutcome } from "@/lib/logs-types";
import {
  buildLoggedSets,
  normalizePinTarget,
  readLogFormRows,
} from "@/lib/log-session-form";
import {
  fetchHarderVariation,
  pinPrescription,
  substitutePrescription,
} from "@/lib/sessions";
import type { SuggestedVariation } from "@/lib/harder-variation-view";
import { resolveAppearance } from "@/lib/appearance";

export interface LogFormState {
  error: string | null;
  // Set once the log is saved, so the client can offer the post-log Pin dialog before leaving the
  // page (ADR-0053, #371). The Pin offer is decided client-side from the rows the form holds
  // (`collectPinCandidates`), so this action no longer redirects on success — the client navigates
  // to History itself when there is no Pin to offer, or after the dialog is dismissed.
  ok?: boolean;
}

// The client submits only Done (attempted) rows — a skipped set marks its `done` field false,
// so the reader drops it (Model B, Q10). Read the derived Completion Outcome back off the
// form, falling back to `completed` for any missing/unknown value so the action never
// fabricates an outcome the form did not send.
function completionOutcome(form: FormData): CompletionOutcome {
  return form.get("completion_outcome") === "incomplete" ? "incomplete" : "completed";
}

export async function submitLog(
  _prevState: LogFormState,
  form: FormData,
): Promise<LogFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to log." };
  }

  const performedOn =
    typeof form.get("performed_on") === "string"
      ? String(form.get("performed_on")).trim()
      : "";
  if (performedOn === "") {
    return { error: "Pick the date you performed this session." };
  }

  // Reading the rows and typing the per-set Quantity by kind live in the pure lib
  // (`readLogFormRows` / `buildLoggedSets`, ADR-0050): the action stays a thin caller and the
  // "which kind, reject-or-skip?" rules are unit-tested. A malformed distance/duration
  // rejects the whole submission with a clear message; a malformed reps set drops silently.
  // The Load values arrive in the user's Weight Unit; resolve it server-side so each entered
  // Load is stored as canonical kilograms (#417). A signed-out/unreachable read defaults to kg.
  const { weight_unit: unit } = await resolveAppearance();
  const built = buildLoggedSets(readLogFormRows(form), unit);
  if (!built.ok) {
    return { error: built.error };
  }
  if (built.sets.length === 0) {
    return { error: "Mark at least one set as done to log this session." };
  }

  // The Completion Outcome is derived per-set (Q8, ADR-0045): the form marks each prescribed
  // set done or skipped, and reports Incomplete when any prescribed set was left un-attempted.
  const result = await logSession(sessionId, {
    performed_on: performedOn,
    completion_outcome: completionOutcome(form),
    logged_sets: built.sets,
  });
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your log." };
  }

  // Saved. The client decides whether a Pin is offered (from the rows it holds) and navigates.
  return { error: null, ok: true };
}

// Read the harder-Variation suggestion for one movement, so the post-log Pin dialog can present
// stepping up to a harder Variation *beside* raising reps (ADR-0053, #371 / #202). A thin server
// wrapper over the read seam (the JWT never reaches the browser); returns the suggestion or null
// when there is none, and null on any read failure so the dialog simply omits the alternative.
export async function harderVariationForPin(
  sessionId: number,
  position: number,
): Promise<SuggestedVariation | null> {
  const result = await fetchHarderVariation(sessionId, position);
  if (!result.success || !result.data) return null;
  return result.data.suggested_variation;
}

// The result of a post-log Pin-offer action: an error message to surface inline, or null on
// success (the caller then advances to the next offer, or leaves for History).
export interface PinOfferResult {
  error: string | null;
}

// Issue the Pin request straight from the post-log offer dialog (ADR-0053, #371): validate the
// (edited) range with the same `normalizePinTarget` rule the backend enforces, then call the pin
// route. On success the Session page is revalidated so the plan reflects the Pinned Target when the
// user next views it. The backend guards apply — a performed Session comes back as its `409`
// message (settled record), which the dialog surfaces inline rather than silently dropping.
export async function pinFromOffer(
  sessionId: number,
  position: number,
  reps: string,
): Promise<PinOfferResult> {
  const normalized = normalizePinTarget(reps);
  if (normalized === null) {
    return { error: "Enter a valid rep target, like 12 or 10-14." };
  }

  const result = await pinPrescription(sessionId, position, normalized);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not pin this rep target." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Accept the harder-Variation alternative straight from the offer dialog (#202/#209): advance the
// movement to the suggested Variation through the user-initiated Substitution flow, carrying its
// `target_exercise_id`. On success the Session page is revalidated so the swap shows; the backend
// message is surfaced on failure.
export async function advanceVariationFromOffer(
  sessionId: number,
  position: number,
  targetExerciseId: number,
): Promise<PinOfferResult> {
  const result = await substitutePrescription(sessionId, position, targetExerciseId);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not advance to this Variation." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}
