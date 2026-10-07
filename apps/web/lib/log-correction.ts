// The Log Correction view-model (ADR-0034): map a Logged Session record to the edit
// form's fields (pre-fill), and map the edited fields back to a `LogCorrectionInput`
// PUT payload (or a user-facing error). Pure and browser-safe (no server-only imports),
// so the record↔form↔payload rules are unit-tested here rather than re-derived inside
// the server action or the component — the sibling of `adhoc-log.ts` for the record's
// *edit* path.

import {
  distanceUnitFromText,
  type DistanceUnit,
  type Quantity,
  type QuantityKind,
} from "./quantity.ts";
import { loadToFields as reverseLoadFields } from "./load.ts";
import {
  buildLoggedSets,
  hasAmount,
  readPostedSetRows,
  type CarriedEffort,
  type LoggedSetRow,
} from "./logged-set.ts";
import { noteText } from "./note-view.ts";
import { setEntryValues, type SetEntryValues } from "./set-entry.ts";
import type { WeightUnit } from "./weight-unit";
import type {
  CompletionOutcome,
  LogCorrectionInput,
  LoggedSession,
} from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

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
  // The record's typed Effort (ADR-0066), carried so a correction re-sends it unchanged while
  // its cell is untouched — the cell shows RPE only, so an RIR or half-step Effort could not
  // otherwise survive the full replace (ADR-0115). Null when the set has no typed Effort.
  carriedEffort: CarriedEffort | null;
  // The Set Note (ADR-0065, #451), as editable raw text. Pre-filled decoded from the stored
  // (escaped) value so the user edits what they typed; blank means "no note". Re-sent raw and
  // re-escaped once by the backend, so correcting a set never double-escapes or drops its note.
  note: string;
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
}

// What a correction request is built from: the form's header, and its rows as Logged Set rows
// (ADR-0115) — whether they came off the pre-fill or back off a posted form.
export interface CorrectionRequestFields extends Omit<CorrectionFormFields, "sets"> {
  sets: LoggedSetRow[];
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
      // The Effort cell is seeded with `perceived_difficulty` (the backend's RPE mirror), so
      // that text is what "untouched" means for the carried Effort.
      carriedEffort: loggedSet.effort
        ? { effort: loggedSet.effort, shownAs: String(loggedSet.perceived_difficulty ?? "") }
        : null,
      // Pre-fill the note decoded from its stored (escaped) form, so the edit field shows the
      // text the user typed rather than raw entities. `noteText` returns null for no note → "".
      note: noteText(loggedSet.note) ?? "",
    })),
  };
}

// A pre-filled set as a Logged Set row: its fields in the entry vocabulary, plus the carried
// Effort. A record with no Load kind on file reads as absolute, the kind a bare weight means.
export function correctionSetRow(set: CorrectionSetFields): LoggedSetRow {
  return {
    exerciseId: set.exerciseId,
    values: setEntryValues({
      kind: set.kind,
      reps: set.reps,
      distance: set.distance,
      unit: set.unit,
      duration: set.duration,
      load_kind: set.loadKind,
      load_value: set.loadValue,
      rpe: set.perceivedDifficulty === null ? "" : String(set.perceivedDifficulty),
      note: set.note,
    }),
    carriedEffort: set.carriedEffort,
  };
}

// One posted correction row. An `existing` row edits a set already on the record — its Exercise
// id rides in a hidden field (ADR-0034 keeps the movement fixed). An `added` row is a newly
// added movement (issue #358) whose name the action resolves to a catalog Exercise
// (search-and-create, ADR-0033).
export type CorrectionPostedRow =
  | { added: false; row: LoggedSetRow }
  | { added: true; movementName: string; values: SetEntryValues };

// Read the correction form's rows in order. A row with a hidden Exercise id is an existing set;
// a row naming a movement instead is an added one. An added row with no amount is dropped here,
// *before* its movement is resolved, so it never mints an orphan catalog Exercise (ADR-0033) —
// the same "a cleared row is removed" rule the build applies to an existing set.
export function correctionRowsFromForm(form: FormData): CorrectionPostedRow[] {
  return readPostedSetRows(form).flatMap((posted): CorrectionPostedRow[] => {
    if (posted.exerciseId !== null) {
      return [
        {
          added: false,
          row: {
            exerciseId: posted.exerciseId,
            values: posted.values,
            carriedEffort: posted.carriedEffort,
          },
        },
      ];
    }
    const movementName = posted.values.movement.trim();
    if (movementName === "" || !hasAmount(posted.values)) return [];
    return [{ added: true, movementName, values: posted.values }];
  });
}

// Assemble a `LogCorrectionInput` PUT payload from the edited fields, validating at the
// boundary: a date is required, at least one set must remain, and a plan-less record
// (no `sessionId`) must carry a known training type. A plan-backed record omits the
// training type — the server derives it from the Session (ADR-0034). A Completion
// Outcome is never sent; the server preserves the record's.
export function buildCorrectionRequest(
  fields: CorrectionRequestFields,
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

  const built = buildLoggedSets(fields.sets, unit);
  if (!built.ok) return built;
  const loggedSets = built.sets;
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
  const fields = correctionFieldsFromRecord(record, "kg");
  return buildCorrectionRequest(
    {
      ...fields,
      sets: fields.sets.map(correctionSetRow),
      completionOutcome: outcome,
    },
    "kg",
  );
}
