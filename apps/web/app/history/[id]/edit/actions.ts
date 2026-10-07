"use server";

import {
  buildCorrectionRequest,
  correctionRowsFromForm,
} from "@/lib/log-correction";
import type { LoggedSetRow } from "@/lib/logged-set";
import { resolveExercise } from "@/lib/exercises";
import { correctSession } from "@/lib/logs";
import { resolveAppearance } from "@/lib/appearance";

export interface CorrectLogFormState {
  error: string | null;
  redirectTo: string | null;
}

function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Correct a Logged Session's contents (ADR-0034). Reads the pre-filled edit form,
// builds the full-replace `LogCorrectionInput` via the shared view-model (which
// validates the date, keeps at least one set, and requires a training type for a
// plan-less record), then PUTs it. `session_id` rides in a hidden field only so the
// view-model knows plan-backed vs plan-less; the backend is authoritative — it keeps
// the record's own Session and preserves the Completion Outcome.
export async function submitCorrection(
  _prevState: CorrectLogFormState,
  form: FormData,
): Promise<CorrectLogFormState> {
  const logId = Number(readField(form, "log_id"));
  if (!Number.isInteger(logId)) {
    return { error: "Could not tell which log to correct.", redirectTo: null };
  }

  const sessionRaw = readField(form, "session_id").trim();
  const durationRaw = readField(form, "duration_seconds").trim();

  // Resolve every added row's movement to a catalog Exercise id before building the
  // request — search-and-create (ADR-0033), the same picker the ad-hoc log uses — so an
  // added set posts a real `exercise_id`, exactly like an existing one. Existing rows
  // already carry their id and pass straight through, preserving row order.
  const sets: LoggedSetRow[] = [];
  for (const posted of correctionRowsFromForm(form)) {
    if (!posted.added) {
      sets.push(posted.row);
      continue;
    }
    const resolved = await resolveExercise(posted.movementName);
    if (!resolved.success || !resolved.data) {
      return {
        error: resolved.error ?? `Could not find or create "${posted.movementName}".`,
        redirectTo: null,
      };
    }
    sets.push({ exerciseId: resolved.data.id, values: posted.values });
  }

  // Load values arrive in the user's Weight Unit; resolve it server-side so each edited Load
  // is stored as canonical kilograms (#417). A signed-out/unreachable read defaults to kg.
  const { weight_unit: unit } = await resolveAppearance();
  const built = buildCorrectionRequest(
    {
      performedOn: readField(form, "performed_on"),
      sessionId: sessionRaw === "" ? null : Number(sessionRaw),
      trainingType: readField(form, "training_type"),
      durationSeconds: durationRaw === "" ? null : Number(durationRaw),
      sets,
    },
    unit,
  );
  if (!built.ok) {
    return { error: built.error, redirectTo: null };
  }

  const result = await correctSession(logId, built.request);
  if (!result.success || !result.data) {
    return {
      error: result.error ?? "Could not save your correction.",
      redirectTo: null,
    };
  }

  // Return to the corrected record's detail — the screen the edit was opened from —
  // so the user sees their correction land, rather than bouncing to the History list.
  // Let the client clear the matching durable draft before navigating away.
  return { error: null, redirectTo: `/history/${logId}` };
}
