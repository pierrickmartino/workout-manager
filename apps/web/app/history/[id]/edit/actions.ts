"use server";

import { redirect } from "next/navigation";

import {
  buildCorrectionRequest,
  type CorrectionSetFields,
} from "@/lib/log-correction";
import type { DistanceUnit, QuantityKind } from "@/lib/quantity";
import { correctSession } from "@/lib/logs";

export interface CorrectLogFormState {
  error: string | null;
}

function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function readRpe(form: FormData, name: string): number | null {
  const raw = readField(form, name).trim();
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

// Read the correction form back into typed set rows. Each set is indexed
// (`set-<i>-exercise_id`, `set-<i>-kind`, `set-<i>-reps`, …) with a `set_count`
// header — the pre-filled rows the form rendered from the record. The Exercise id and
// its amount kind are carried in hidden fields (this slice edits a set's contents, not
// its movement or kind), so the row round-trips through the same shape the view-model
// pre-filled.
function readSets(form: FormData): CorrectionSetFields[] {
  const count = Number(readField(form, "set_count"));
  if (!Number.isInteger(count) || count <= 0) return [];

  const sets: CorrectionSetFields[] = [];
  for (let index = 0; index < count; index += 1) {
    sets.push({
      exerciseId: Number(readField(form, `set-${index}-exercise_id`)),
      exerciseName: readField(form, `set-${index}-exercise_name`),
      kind: (readField(form, `set-${index}-kind`) || "repetitions") as QuantityKind,
      reps: readField(form, `set-${index}-reps`),
      distance: readField(form, `set-${index}-distance`),
      unit: (readField(form, `set-${index}-unit`) || "km") as DistanceUnit,
      duration: readField(form, `set-${index}-duration`),
      loadKind: readField(form, `set-${index}-load_kind`),
      loadValue: readField(form, `set-${index}-load_value`),
      perceivedDifficulty: readRpe(form, `set-${index}-rpe`),
    });
  }
  return sets;
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
    return { error: "Could not tell which log to correct." };
  }

  const sessionRaw = readField(form, "session_id").trim();
  const durationRaw = readField(form, "duration_seconds").trim();

  const built = buildCorrectionRequest({
    performedOn: readField(form, "performed_on"),
    sessionId: sessionRaw === "" ? null : Number(sessionRaw),
    trainingType: readField(form, "training_type"),
    durationSeconds: durationRaw === "" ? null : Number(durationRaw),
    sets: readSets(form),
  });
  if (!built.ok) {
    return { error: built.error };
  }

  const result = await correctSession(logId, built.request);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your correction." };
  }

  redirect("/history");
}
