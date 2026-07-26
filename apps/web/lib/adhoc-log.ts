// The plan-less log view-model (ADR-0031): turn the ad-hoc form's raw fields into a
// validated `LogAdhocInput`, or a user-facing error. Pure and browser-safe (no
// server-only imports), so the request-building rules are unit-tested here rather than
// re-derived inside the server action or the component — the frontend twin of the
// backend's `resolve_training_type` boundary rule.

import {
  distanceInput,
  repetitionsInput,
  type DistanceUnit,
  type QuantityKind,
} from "./quantity.ts";
import type { LogAdhocInput, LogSetInput } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

const DEFAULT_LOAD_KIND = "absolute";
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

// One row of the ad-hoc form: the picked catalog Exercise, the kind of amount performed
// (a rep count or a distance, ADR-0032), and the load done. The amount field is raw — a
// blank row is one the user didn't perform and is skipped. `kind` defaults to
// `repetitions`, the amount the log form has always collected.
export interface AdhocSetFields {
  exerciseId: number;
  kind?: QuantityKind;
  // The repetitions amount (a whole, non-negative count).
  reps?: string;
  // The distance amount: a positive value in `unit` (km or miles), with an optional
  // companion time from which pace becomes derivable.
  distance?: string;
  unit?: DistanceUnit;
  duration?: string;
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

// The set fields a form row carries before its movement name is resolved to a catalog
// Exercise id (ADR-0033) — everything in `AdhocSetFields` except that id.
export type AdhocRowFields = Omit<AdhocSetFields, "exerciseId">;

// One parsed form row: the movement the user named and the amount/load fields they
// entered. The id is resolved separately (search-and-create), so this stays pure.
export interface AdhocFormRow {
  movementName: string;
  fields: AdhocRowFields;
}

function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Read the dynamic multi-row ad-hoc form into typed rows. Fields are indexed by row
// (`set-<i>-movement`, `set-<i>-kind`, `set-<i>-reps`, …) with a `set_count` header; a
// row that names no movement was never filled in and is dropped. Pure and browser-safe
// so the server action stays a thin resolve-then-build shell.
export function readAdhocFormRows(form: FormData): AdhocFormRow[] {
  const count = Number(readField(form, "set_count"));
  if (!Number.isInteger(count) || count <= 0) return [];

  const rows: AdhocFormRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const movementName = readField(form, `set-${index}-movement`).trim();
    if (movementName === "") continue;

    const kind = readField(form, `set-${index}-kind`);
    rows.push({
      movementName,
      fields: {
        kind: (kind === "distance" ? "distance" : "repetitions") as QuantityKind,
        reps: readField(form, `set-${index}-reps`),
        distance: readField(form, `set-${index}-distance`),
        unit: (readField(form, `set-${index}-unit`) || DEFAULT_DISTANCE_UNIT) as DistanceUnit,
        duration: readField(form, `set-${index}-duration`),
        loadKind: readField(form, `set-${index}-load_kind`),
        loadValue: readField(form, `set-${index}-load_value`),
      },
    });
  }
  return rows;
}

// The load fields shared by every kind: the picked load kind (defaulting to absolute)
// and its value, or null when the row records no load.
function loadFields(row: AdhocSetFields): Pick<LogSetInput, "load_kind" | "load_value"> {
  const loadValue = row.loadValue?.trim() ?? "";
  return {
    load_kind: (row.loadKind || DEFAULT_LOAD_KIND) as LogSetInput["load_kind"],
    load_value: loadValue === "" ? null : loadValue,
  };
}

// The amount fields for a repetitions row, or null when it was left un-performed (no
// reps) or malformed (a rep count is a whole, non-negative number).
function repetitionsAmount(
  row: AdhocSetFields,
): Pick<LogSetInput, "quantity_kind" | "quantity_value"> | null {
  const raw = (row.reps ?? "").trim();
  if (raw === "") return null;

  const reps = Number(raw);
  if (!Number.isInteger(reps) || reps < 0) return null;
  return repetitionsInput(reps);
}

// The amount fields for a distance row, or null when it was left un-performed (no
// distance) or malformed (a distance is a positive number). Unit and companion time
// ride through so the backend canonicalises to metres and derives pace.
function distanceAmount(
  row: AdhocSetFields,
): Pick<
  LogSetInput,
  "quantity_kind" | "quantity_value" | "quantity_unit" | "quantity_duration"
> | null {
  const raw = (row.distance ?? "").trim();
  if (raw === "") return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return distanceInput(raw, row.unit ?? DEFAULT_DISTANCE_UNIT, row.duration ?? "");
}

// Build one logged-set payload from a row, or null when the row was left un-performed
// or is malformed. Mirrors the plan-backed form: the picked kinds ride through so the
// backend types the amount and load at the write boundary.
function toSet(row: AdhocSetFields): LogSetInput | null {
  if (!Number.isInteger(row.exerciseId)) return null;

  const amount =
    (row.kind ?? "repetitions") === "distance"
      ? distanceAmount(row)
      : repetitionsAmount(row);
  if (amount === null) return null;

  return {
    exercise_id: row.exerciseId,
    ...amount,
    ...loadFields(row),
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
    return { ok: false, error: "Enter an amount for at least one set you performed." };
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
