// The plan-less log view-model (ADR-0031): turn the ad-hoc form's raw fields into a
// validated `LogAdhocInput`, or a user-facing error. Pure and browser-safe (no
// server-only imports), so the request-building rules are unit-tested here rather than
// re-derived inside the server action or the component — the frontend twin of the
// backend's `resolve_training_type` boundary rule.

import { repetitionsInput } from "./quantity.ts";
import type { LogAdhocInput, LogSetInput } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

// One row of the ad-hoc form: the picked catalog Exercise and the amount/load done.
// `reps` is raw (a blank row is one the user didn't perform and is skipped).
export interface AdhocSetFields {
  exerciseId: number;
  reps: string;
  loadKind?: string;
  loadValue?: string;
}

export interface AdhocLogFields {
  performedOn: string;
  trainingType: string;
  sets: AdhocSetFields[];
}

export type AdhocLogResult =
  | { ok: true; request: LogAdhocInput }
  | { ok: false; error: string };

const DEFAULT_LOAD_KIND = "absolute";

// Build one logged-set payload from a row, or null when the row was left un-performed
// (no reps) or is malformed. Mirrors the plan-backed form: the picked kinds ride
// through so the backend types the amount and load at the write boundary.
function toSet(row: AdhocSetFields): LogSetInput | null {
  if (row.reps.trim() === "") return null;

  const reps = Number(row.reps);
  if (!Number.isInteger(reps) || reps < 0) return null;
  if (!Number.isInteger(row.exerciseId)) return null;

  const loadValue = row.loadValue?.trim() ?? "";
  return {
    exercise_id: row.exerciseId,
    ...repetitionsInput(reps),
    load_kind: (row.loadKind || DEFAULT_LOAD_KIND) as LogSetInput["load_kind"],
    load_value: loadValue === "" ? null : loadValue,
    perceived_difficulty: null,
  };
}

// Assemble a plan-less log request from the form fields, validating at the boundary:
// a date and a known training type are required, and at least one set must have been
// performed. A Completion Outcome is never sent — an ad-hoc record declares none.
export function buildAdhocLogRequest(fields: AdhocLogFields): AdhocLogResult {
  const performedOn = fields.performedOn.trim();
  if (performedOn === "") {
    return { ok: false, error: "Pick the date you performed this." };
  }

  const trainingType = fields.trainingType.trim();
  if (!VALID_TRAINING_TYPES.has(trainingType)) {
    return { ok: false, error: "Pick a training type." };
  }

  const loggedSets = fields.sets
    .map(toSet)
    .filter((set): set is LogSetInput => set !== null);
  if (loggedSets.length === 0) {
    return { ok: false, error: "Enter the reps for at least one set you performed." };
  }

  return {
    ok: true,
    request: {
      performed_on: performedOn,
      training_type: trainingType,
      logged_sets: loggedSets,
    },
  };
}
