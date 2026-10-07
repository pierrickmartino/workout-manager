// The plan-less log view-model (ADR-0031): turn the ad-hoc form's posted rows into a
// validated `LogAdhocInput`, or a user-facing error. Pure and browser-safe (no
// server-only imports), so the request rules are unit-tested here rather than re-derived
// inside the server action or the component — the frontend twin of the backend's
// `resolve_training_type` boundary rule. Each row is built into a Logged Set by the shared
// `logged-set` module (ADR-0115); this file owns only what is particular to the path: rows are
// named by movement, and the record header needs a date and a known Training Type.

import {
  buildLoggedSets,
  readPostedSetRows,
  type LoggedSetRow,
} from "./logged-set.ts";
import type { LogAdhocInput } from "./logs-types";
import type { SetEntryValues } from "./set-entry.ts";
import { TRAINING_TYPES } from "./sessions-types.ts";
import type { WeightUnit } from "./weight-unit";

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

export interface AdhocLogFields {
  performedOn: string;
  trainingType: string;
  // Each row with its movement already resolved to a catalog Exercise (ADR-0033).
  sets: LoggedSetRow[];
}

export type AdhocLogResult =
  | { ok: true; request: LogAdhocInput }
  | { ok: false; error: string };

// One posted row: the movement the user named and the entry values they typed. The id is
// resolved separately (search-and-create), so this stays pure.
export interface AdhocFormRow {
  movementName: string;
  values: SetEntryValues;
}

// The ad-hoc form's rows, keeping only the ones that name a movement — a row with no movement
// was never filled in.
export function readAdhocFormRows(form: FormData): AdhocFormRow[] {
  return readPostedSetRows(form).flatMap((posted) => {
    const movementName = posted.values.movement.trim();
    return movementName === "" ? [] : [{ movementName, values: posted.values }];
  });
}

// Assemble a plan-less log request, validating at the boundary: a date and a known Training
// Type are required, and at least one set must have been performed. A Completion Outcome is
// never sent — an ad-hoc record declares none.
export function buildAdhocLogRequest(
  fields: AdhocLogFields,
  unit: WeightUnit,
): AdhocLogResult {
  const performedOn = fields.performedOn.trim();
  if (performedOn === "") {
    return { ok: false, error: "Pick the date you performed this." };
  }

  const trainingType = fields.trainingType.trim();
  if (!VALID_TRAINING_TYPES.has(trainingType)) {
    return { ok: false, error: "Pick a training type." };
  }

  const built = buildLoggedSets(fields.sets, unit);
  if (!built.ok) return built;
  if (built.sets.length === 0) {
    return { ok: false, error: "Enter an amount for at least one set you performed." };
  }

  return {
    ok: true,
    request: {
      performed_on: performedOn,
      training_type: trainingType,
      logged_sets: built.sets,
    },
  };
}
