// The Log Correction view-model (ADR-0034): map a Logged Session record to the edit
// form's fields (pre-fill), and map the edited fields back to a `LogCorrectionInput`
// PUT payload (or a user-facing error). Pure and browser-safe (no server-only imports),
// so the record↔form↔payload rules are unit-tested here rather than re-derived inside
// the server action or the component — the sibling of `adhoc-log.ts` for the record's
// *edit* path.

import {
  distanceInput,
  distanceUnitFromText,
  durationInput,
  repetitionsInput,
  type DistanceUnit,
  type Quantity,
  type QuantityKind,
} from "./quantity.ts";
import { loadToFields as reverseLoadFields, loadValueToKg } from "./load.ts";
import type { WeightUnit } from "./weight-unit";
import type {
  CompletionOutcome,
  LogCorrectionInput,
  LoggedSession,
  LogSetInput,
} from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

const DEFAULT_LOAD_KIND = "absolute";
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";
const METRES_PER_MILE = 1609.344;
const METRES_PER_KM = 1000;
const SECONDS_PER_MINUTE = 60;

// One editable row of the correction form: the catalog Exercise the set records (its id
// and display name, both fixed here — this slice does not re-pick the movement), the
// amount kind and its raw field, the load, and the perceived difficulty. The fields are
// raw strings so the form can bind them directly; the build step validates them.
export interface CorrectionSetFields {
  exerciseId: number;
  exerciseName: string;
  kind: QuantityKind;
  reps: string;
  distance: string;
  unit: DistanceUnit;
  duration: string;
  loadKind: string;
  loadValue: string;
  perceivedDifficulty: number | null;
}

// The whole correction form: the record's editable header (`performedOn`, its
// `durationSeconds`) plus its set rows. `sessionId` is carried (immutable, ADR-0034) so
// the build step knows whether the record is plan-backed — a plan-less record's
// `trainingType` is editable and required, a plan-backed one's is derived server-side.
export interface CorrectionFormFields {
  performedOn: string;
  sessionId: number | null;
  trainingType: string;
  durationSeconds: number | null;
  sets: CorrectionSetFields[];
  // The corrected Completion Outcome (ADR-0013), or omitted/`null` to leave the record's
  // unchanged. Only the outcome-toggle path sets it; the contents-edit form leaves it out
  // so a save preserves the record's outcome server-side.
  completionOutcome?: CompletionOutcome | null;
}

export type CorrectionResult =
  | { ok: true; request: LogCorrectionInput }
  | { ok: false; error: string };

// Format whole seconds as `m:ss` — the display form the distance companion time and
// duration fields round-trip through (the backend re-canonicalises to seconds).
function clock(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / SECONDS_PER_MINUTE);
  const seconds = rounded % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Trim a distance value's float noise (5000 m / 1000 → 5, not 4.999…) to a short,
// stable string the form shows and re-sends.
function trimNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

// Reverse a typed Quantity into the raw form fields for its kind (ADR-0032). Only the
// field the kind uses is populated; the others stay blank. A distance carries its unit
// (read off the display text's suffix) and its companion time so pace stays derivable.
function quantityToFields(
  quantity: Quantity | null,
): Pick<
  CorrectionSetFields,
  "kind" | "reps" | "distance" | "unit" | "duration"
> {
  const blank = {
    reps: "",
    distance: "",
    unit: DEFAULT_DISTANCE_UNIT,
    duration: "",
  };
  if (quantity === null) return { kind: "repetitions", ...blank };

  if (quantity.kind === "distance") {
    const unit: DistanceUnit = distanceUnitFromText(quantity.text);
    const metresPerUnit = unit === "mi" ? METRES_PER_MILE : METRES_PER_KM;
    const metres = quantity.metres ?? 0;
    return {
      kind: "distance",
      ...blank,
      unit,
      distance: metres > 0 ? trimNumber(metres / metresPerUnit) : "",
      duration: quantity.duration_s != null ? clock(quantity.duration_s) : "",
    };
  }

  if (quantity.kind === "duration") {
    // The display text ("5:00", "45:00") is what the duration input re-sends verbatim.
    return { kind: "duration", ...blank, duration: quantity.text ?? "" };
  }

  return { kind: "repetitions", ...blank, reps: String(quantity.count ?? "") };
}

// Pre-fill the correction form from the record's current values (ADR-0034). Each set is
// reversed into raw fields so the form binds them directly and a save with no edits
// re-sends the record unchanged. The typed Load reverse-map is the shared `loadToFields`
// (lib/load.ts), so the correction pre-fill and the Capture seed never drift.
export function correctionFieldsFromRecord(
  record: LoggedSession,
  unit: WeightUnit,
): CorrectionFormFields {
  return {
    performedOn: record.performed_on,
    sessionId: record.session_id,
    trainingType: record.training_type,
    durationSeconds: record.duration_seconds,
    sets: record.logged_sets.map((loggedSet) => ({
      exerciseId: loggedSet.exercise_id,
      exerciseName: loggedSet.exercise_name,
      ...quantityToFields(loggedSet.quantity),
      ...reverseLoadFields(loggedSet.load, unit),
      perceivedDifficulty: loggedSet.perceived_difficulty,
    })),
  };
}

// The load fields for a row: the picked kind (defaulting to absolute) and its value,
// or null when the row records no load.
function loadFields(
  row: CorrectionSetFields,
  unit: WeightUnit,
): Pick<LogSetInput, "load_kind" | "load_value"> {
  const loadKind = row.loadKind || DEFAULT_LOAD_KIND;
  // The value was edited in the reader's Weight Unit; convert it back to canonical kilograms
  // for storage (#417). Blank stays "no load recorded" → null.
  const loadValue = loadValueToKg(loadKind, row.loadValue.trim(), unit);
  return {
    load_kind: loadKind as LogSetInput["load_kind"],
    load_value: loadValue === "" ? null : loadValue,
  };
}

// Parse a time value into total seconds — `mm:ss` / `hh:mm:ss` summed in base-60, or a
// bare number of seconds — or null for any non-numeric segment. Mirrors the backend so
// the boundary rejects here exactly what it would there.
function parseDurationSeconds(raw: string): number | null {
  let seconds = 0;
  for (const segment of raw.split(":")) {
    const value = Number(segment);
    if (segment.trim() === "" || !Number.isFinite(value) || value < 0)
      return null;
    seconds = seconds * 60 + value;
  }
  return seconds;
}

// The typed amount fields for a row, or null when it was left un-performed or malformed
// (a blank/malformed row is dropped, letting a user clear a set to remove it). Mirrors
// the ad-hoc form's per-kind validation so the two record paths agree at the boundary.
function amountFor(
  row: CorrectionSetFields,
): Pick<
  LogSetInput,
  "quantity_kind" | "quantity_value" | "quantity_unit" | "quantity_duration"
> | null {
  if (row.kind === "distance") {
    const raw = row.distance.trim();
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value) || value <= 0) return null;
    return distanceInput(
      raw,
      row.unit ?? DEFAULT_DISTANCE_UNIT,
      row.duration ?? "",
    );
  }
  if (row.kind === "duration") {
    const raw = row.duration.trim();
    if (raw === "") return null;
    const seconds = parseDurationSeconds(raw);
    if (seconds === null || seconds <= 0) return null;
    return durationInput(raw);
  }
  const raw = row.reps.trim();
  if (raw === "") return null;
  const reps = Number(raw);
  if (!Number.isInteger(reps) || reps < 0) return null;
  return repetitionsInput(reps);
}

// Build one logged-set payload from a row, or null when the row was left un-performed or
// is malformed. The perceived difficulty rides through so the correction preserves it.
function toSet(row: CorrectionSetFields, unit: WeightUnit): LogSetInput | null {
  if (!Number.isInteger(row.exerciseId)) return null;
  const amount = amountFor(row);
  if (amount === null) return null;
  return {
    exercise_id: row.exerciseId,
    ...amount,
    ...loadFields(row, unit),
    perceived_difficulty: row.perceivedDifficulty,
  };
}

// Assemble a `LogCorrectionInput` PUT payload from the edited fields, validating at the
// boundary: a date is required, at least one set must remain, and a plan-less record
// (no `sessionId`) must carry a known training type. A plan-backed record omits the
// training type — the server derives it from the Session (ADR-0034). A Completion
// Outcome is never sent; the server preserves the record's.
export function buildCorrectionRequest(
  fields: CorrectionFormFields,
  unit: WeightUnit,
): CorrectionResult {
  const performedOn = fields.performedOn.trim();
  if (performedOn === "") {
    return { ok: false, error: "Pick the date you performed this." };
  }

  const isPlanLess = fields.sessionId === null;
  const trainingType = fields.trainingType.trim();
  if (isPlanLess && !VALID_TRAINING_TYPES.has(trainingType)) {
    return { ok: false, error: "Pick a training type." };
  }

  const loggedSets = fields.sets
    .map((row) => toSet(row, unit))
    .filter((set): set is LogSetInput => set !== null);
  if (loggedSets.length === 0) {
    return {
      ok: false,
      error:
        "Keep at least one set — enter its amount, or delete the record instead.",
    };
  }

  const request: LogCorrectionInput = {
    performed_on: performedOn,
    logged_sets: loggedSets,
  };
  if (fields.durationSeconds != null) {
    request.duration_seconds = fields.durationSeconds;
  }
  if (isPlanLess) {
    request.training_type = trainingType;
  }
  if (fields.completionOutcome != null) {
    request.completion_outcome = fields.completionOutcome;
  }
  return { ok: true, request };
}

// Build a `LogCorrectionInput` that flips only a plan-backed record's Completion Outcome
// (ADR-0034), re-sending the record's current contents unchanged so the full-replace PUT
// preserves the reps, load, date, and duration. The History outcome toggle uses this: the
// server re-vets a flip to Incomplete through the contiguity gate (409 on a gap), and
// recomputes advancement / Next Session and every read-time projection on the next read.
export function buildOutcomeCorrection(
  record: LoggedSession,
  outcome: CompletionOutcome,
): CorrectionResult {
  // This is a pure round-trip of the record's own kilogram contents — the reversed fields
  // are never shown to the user — so it converts in canonical kilograms end to end, keeping
  // every stored Load byte-for-byte unchanged regardless of the reader's Weight Unit (#417).
  return buildCorrectionRequest(
    {
      ...correctionFieldsFromRecord(record, "kg"),
      completionOutcome: outcome,
    },
    "kg",
  );
}
