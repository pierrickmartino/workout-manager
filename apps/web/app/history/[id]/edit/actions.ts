"use server";

import { redirect } from "next/navigation";

import {
  buildCorrectionRequest,
  type CorrectionSetFields,
} from "@/lib/log-correction";
import type { DistanceUnit, QuantityKind } from "@/lib/quantity";
import { resolveExercise } from "@/lib/exercises";
import { correctSession } from "@/lib/logs";

export interface CorrectLogFormState {
  error: string | null;
}

// The raw fields a form row carries once its movement is known — everything a
// `CorrectionSetFields` holds except the catalog Exercise identity. An appended row
// (issue #358) supplies these plus a movement *name*, resolved to an Exercise id below.
type CorrectionRowFields = Omit<CorrectionSetFields, "exerciseId" | "exerciseName">;

// One parsed correction row. An `existing` row edits a set already on the record — its
// Exercise id and name ride in hidden fields (ADR-0034 keeps the movement fixed). An
// `appended` row is a newly added movement whose name resolves to a catalog Exercise
// (search-and-create, ADR-0033), exactly like the ad-hoc "Log a movement" flow.
type CorrectionRow =
  | { added: false; set: CorrectionSetFields }
  | { added: true; movementName: string; fields: CorrectionRowFields };

// The upper bound on rows read from one correction submission — a real record never
// approaches it. The client sends the row count in a hidden field, so the reader clamps to
// this ceiling: a forged, absurdly large `set_count` is bounded to fixed work.
const MAX_SET_ROWS = 500;

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

// The raw amount/load/difficulty fields shared by every row shape, read by index
// (`set-<i>-kind`, `set-<i>-reps`, …). The view-model validates them at the build step.
function readRowFields(form: FormData, index: number): CorrectionRowFields {
  return {
    kind: (readField(form, `set-${index}-kind`) || "repetitions") as QuantityKind,
    reps: readField(form, `set-${index}-reps`),
    distance: readField(form, `set-${index}-distance`),
    unit: (readField(form, `set-${index}-unit`) || "km") as DistanceUnit,
    duration: readField(form, `set-${index}-duration`),
    loadKind: readField(form, `set-${index}-load_kind`),
    loadValue: readField(form, `set-${index}-load_value`),
    perceivedDifficulty: readRpe(form, `set-${index}-rpe`),
  };
}

// Whether an added row carries an amount for its picked kind — the field the view-model's
// build step reads (ADR-0032). An added row with no amount is left un-performed, so it is
// dropped *before* its movement is resolved: it never mints an orphan catalog Exercise
// (ADR-0033) and never blocks the save. This mirrors the "cleared row is removed" drop the
// view-model applies to an existing row, keyed here on the same per-kind amount field.
function hasAmount(fields: CorrectionRowFields): boolean {
  const amount =
    fields.kind === "distance"
      ? fields.distance
      : fields.kind === "duration"
        ? fields.duration
        : fields.reps;
  return amount.trim() !== "";
}

// Read the correction form back into typed rows, in order. Each set is indexed
// (`set-<i>-exercise_id`, `set-<i>-kind`, `set-<i>-reps`, …) with a `set_count` header.
// A row carrying a hidden Exercise id is an *existing* set (this path edits its contents,
// not its movement); a row carrying a movement *name* instead is a newly *added* set
// (issue #358), resolved to a catalog Exercise below. A blank added row — no id and no
// movement named — was never filled in, so it is dropped (the cleared-row behavior).
function readRows(form: FormData): CorrectionRow[] {
  const count = Number(readField(form, "set_count"));
  if (!Number.isInteger(count) || count <= 0) return [];

  const rows: CorrectionRow[] = [];
  const bounded = Math.min(count, MAX_SET_ROWS);
  for (let index = 0; index < bounded; index += 1) {
    const idRaw = readField(form, `set-${index}-exercise_id`).trim();
    const exerciseId = Number(idRaw);
    if (idRaw !== "" && Number.isInteger(exerciseId)) {
      rows.push({
        added: false,
        set: {
          exerciseId,
          exerciseName: readField(form, `set-${index}-exercise_name`),
          ...readRowFields(form, index),
        },
      });
      continue;
    }

    const movementName = readField(form, `set-${index}-movement`).trim();
    const fields = readRowFields(form, index);
    if (movementName === "" || !hasAmount(fields)) continue;
    rows.push({ added: true, movementName, fields });
  }
  return rows;
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

  // Resolve every added row's movement to a catalog Exercise id before building the
  // request — search-and-create (ADR-0033), the same picker the ad-hoc log uses — so an
  // added set posts a real `exercise_id`, exactly like an existing one. Existing rows
  // already carry their id and pass straight through, preserving row order.
  const sets: CorrectionSetFields[] = [];
  for (const row of readRows(form)) {
    if (!row.added) {
      sets.push(row.set);
      continue;
    }
    const resolved = await resolveExercise(row.movementName);
    if (!resolved.success || !resolved.data) {
      return {
        error: resolved.error ?? `Could not find or create "${row.movementName}".`,
      };
    }
    sets.push({
      exerciseId: resolved.data.id,
      exerciseName: resolved.data.name,
      ...row.fields,
    });
  }

  const built = buildCorrectionRequest({
    performedOn: readField(form, "performed_on"),
    sessionId: sessionRaw === "" ? null : Number(sessionRaw),
    trainingType: readField(form, "training_type"),
    durationSeconds: durationRaw === "" ? null : Number(durationRaw),
    sets,
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
