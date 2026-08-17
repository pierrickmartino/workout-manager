// The Log-a-Session view-model: expand a Session's Exercise Prescriptions into the editable
// per-set rows the static log form records, and derive the Completion Outcome from what the
// user marked done. Pure and browser-safe, so the "how many rows, seeded with what, and is
// this Completed?" rules are unit-tested here and `LogSessionForm` stays a thin renderer.
//
// Two fidelity rules the old one-row-per-exercise form dropped (Q1/Q4):
//   * a prescription of N sets expands to **N set-rows**, each pre-filled with the
//     prescribed reps/load as an editable default, so logging never silently collapses the
//     set count; and
//   * Supersets ride through **cosmetically** — the same lettered A/B badge the Session view
//     shows — via `supersetLayout`, without ever touching the flat record model (Q5): a
//     Logged Set carries no grouping.
//
// Completion Outcome is **derived**, not declared (Q8, ADR-0013): a set is *attempted* when
// its Done toggle is checked (Q10, Model B) — even at 0 reps, since a set ground out to
// failure is still attempted — and a Session is Completed only when every prescribed set was
// attempted.

import type { CompletionOutcome, LogSetInput } from "./logs-types";
import { loadToFields, type LoadKind } from "./load.ts";
import {
  distanceInput,
  distanceValueFromMetres,
  distanceUnitFromText,
  durationInput,
  formatSecondsAsClock,
  parseDurationSeconds,
  repetitionsInput,
  type DistanceUnit,
  type Quantity,
  type QuantityKind,
} from "./quantity.ts";
import { supersetLayout, type SupersetSlot } from "./supersets.ts";
import type { ExercisePrescription } from "./sessions-types";

// Every prescription shows at least one row, even a malformed sets=0, so an exercise is never
// silently un-loggable.
const MIN_ROWS = 1;
const INTEGER = /^\d+$/;

// The upper bound on rows `readLogFormRows` will walk for one submission — a real Session,
// even a very long circuit, never comes close. The client sends the row count in a hidden
// field, so the reader clamps to this ceiling before looping: a forged, absurdly large
// `set_count` is bounded to a fixed amount of work rather than driving an unbounded loop.
const MAX_SET_ROWS = 500;

// A `distance` set's unit falls back to km when none can be read — the same default the
// ad-hoc and Hand-Authored logs use (ADR-0032).
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

// The kinds a log row may carry, defaulting to `repetitions` — the quantity the plan-backed
// form has always collected — for a blank or unrecognized value (ADR-0032/0050).
const QUANTITY_KINDS = new Set<string>(["repetitions", "distance", "duration"]);

function normalizeKind(kind: string): QuantityKind {
  return (QUANTITY_KINDS.has(kind) ? kind : "repetitions") as QuantityKind;
}

const MIN_RPE = 1;
const MAX_RPE = 10;

// One editable set-row in the log form. `prescriptionPosition` ties the row back to the
// prescription it came from so Completion Outcome can compare attempted vs prescribed per
// prescription (not merely per exercise, which would conflate an exercise prescribed twice).
//
// The set is kind-aware (ADR-0050): `kind` fixes which quantity field carries the performance —
// `reps` for repetitions, `distance` (+ `unit`, + optional companion `duration`) for a run,
// `duration` alone for a timed hold. The three quantity fields all exist on the row but only the
// one the kind names is meaningful; the others ride empty. `showLoad` starts false for a
// distance/duration set — Load is the orthogonal "how hard" axis, absent on a plain run — and
// is opened when a load is prescribed or the user opts into a loaded carry.
export interface LogSetRow {
  key: string;
  prescriptionPosition: number;
  exerciseId: number;
  setNumber: number;
  kind: QuantityKind;
  reps: string;
  distance: string;
  unit: DistanceUnit;
  // The `mm:ss`/bare-seconds time: a `distance` set's optional companion time (from which
  // pace becomes derivable), or a `duration` set's hold time (its quantity). One field, one
  // meaning per kind, as in the ad-hoc log.
  duration: string;
  loadKind: LoadKind;
  loadValue: string;
  // Whether the Load block is shown for this row (ADR-0050): true for repetitions, and for a
  // distance/duration set only when a load is prescribed or the user opted in.
  showLoad: boolean;
  rpe: string;
  // Model B (Q10): a Done set is attempted and is logged; an un-done set is skipped — it is
  // dropped from the record and marks its prescribed set un-attempted. Default true.
  done: boolean;
}

// One prescription's group in the form: its metadata, cosmetic Superset slot, and its
// initial set-rows (the user may add/remove rows from here).
export interface LogPrescriptionGroup {
  position: number;
  exerciseId: number;
  exerciseName: string;
  prescribedSets: number;
  // The prescription's Quantity kind, so the group's rows all render the matching input.
  kind: QuantityKind;
  // The prescribed quantity string ("8-12", "AMRAP", "7 KM", "45s") shown as the placeholder
  // hint and in the "N × … PRESCRIBED" line, straight from the verbatim free text. Kind-
  // agnostic since the plan became kind-aware (ADR-0050) — no longer reps-only.
  hint: string;
  superset: SupersetSlot;
  rows: LogSetRow[];
}

// The quantity fields a row is seeded with, read off the typed Prescribed Quantity (ADR-0050).
// The `kind` fixes which field is meaningful; the others ride empty. A distance seeds its
// value from canonical metres and its unit from the display text; a duration seeds its hold
// time from canonical seconds; repetitions seed the reps field the old form always did.
interface SeededQuantity {
  kind: QuantityKind;
  reps: string;
  distance: string;
  unit: DistanceUnit;
  duration: string;
}

// Seed the quantity fields from the prescription's typed Quantity, falling back to a
// repetitions row seeded from the free-text reps when no typed Quantity is present (a
// pre-backfill/legacy read). A distance's companion time is left blank — the plan prescribes
// the distance, not how long the user will take; they enter that when they log.
function seedQuantity(
  prescription: ExercisePrescription,
  quantity: Quantity | null | undefined,
): SeededQuantity {
  if (quantity?.kind === "distance") {
    const unit = distanceUnitFromText(quantity.text);
    return {
      kind: "distance",
      reps: "",
      distance: distanceValueFromMetres(quantity.metres, unit),
      unit,
      duration: "",
    };
  }
  if (quantity?.kind === "duration") {
    // The hold time seeds from canonical seconds, formatted as `mm:ss` to match the time
    // field's placeholder (a bare "90" would read ambiguously against a `mm:ss` prompt); the
    // verbatim "45s"/"0:30" stays the hint, since it may carry a unit the field won't parse.
    const seconds = quantity.seconds;
    return {
      kind: "duration",
      reps: "",
      distance: "",
      unit: DEFAULT_DISTANCE_UNIT,
      duration: seconds != null && seconds > 0 ? formatSecondsAsClock(seconds) : "",
    };
  }
  return {
    kind: "repetitions",
    reps: seededReps(prescription.reps),
    distance: "",
    unit: DEFAULT_DISTANCE_UNIT,
    duration: "",
  };
}

// Seed a reps field from the prescribed reps: the number itself when it is a clean integer
// ("5" → "5"), else blank — a range like "8-12" or "AMRAP" cannot fill a number input, so it
// rides as a placeholder hint instead of a fabricated value.
export function seededReps(prescribedReps: string): string {
  const trimmed = prescribedReps.trim();
  return INTEGER.test(trimmed) ? trimmed : "";
}

// The prescribed set count actually rendered — at least one row even for a malformed sets=0.
export function prescribedRowCount(prescription: ExercisePrescription): number {
  return Math.max(MIN_ROWS, prescription.sets);
}

// Expand ordered prescriptions into per-prescription groups of pre-filled set-rows, carrying
// the cosmetic Superset layout (ADR-0023) alongside. The starting state of the log form.
export function buildLogForm(
  prescriptions: ExercisePrescription[],
): LogPrescriptionGroup[] {
  const slots = supersetLayout(
    prescriptions.map((prescription) => ({
      supersetGroup: prescription.superset_group ?? null,
      roundRestSeconds: prescription.round_rest_seconds ?? null,
    })),
  );

  return prescriptions.map((prescription, index) => {
    const seededLoad = loadToFields(prescription.recommended_load ?? null);
    const seeded = seedQuantity(prescription, prescription.prescribed_quantity);
    // Load rides by default only for repetitions; a distance/duration set hides it unless a
    // load was actually prescribed (a loaded carry), where the user can still see and edit it.
    const showLoad =
      seeded.kind === "repetitions" || prescription.recommended_load != null;
    const count = prescribedRowCount(prescription);
    const rows: LogSetRow[] = Array.from({ length: count }, (_, set) => ({
      key: `${prescription.position}-${set}`,
      prescriptionPosition: prescription.position,
      exerciseId: prescription.exercise_id,
      setNumber: set + 1,
      kind: seeded.kind,
      reps: seeded.reps,
      distance: seeded.distance,
      unit: seeded.unit,
      duration: seeded.duration,
      loadKind: seededLoad.loadKind,
      loadValue: seededLoad.loadValue,
      showLoad,
      rpe: "",
      done: true,
    }));
    return {
      position: prescription.position,
      exerciseId: prescription.exercise_id,
      exerciseName: prescription.exercise_name,
      prescribedSets: count,
      kind: seeded.kind,
      hint: prescription.reps,
      superset: slots[index],
      rows,
    };
  });
}

// The prescribed set count per prescription position — the yardstick Completion Outcome
// derivation measures attempted sets against.
export function prescribedByPosition(
  groups: readonly LogPrescriptionGroup[],
): Map<number, number> {
  return new Map(groups.map((group) => [group.position, group.prescribedSets]));
}

// The count of attempted (Done) sets per prescription position across the live rows.
function attemptedByPosition(
  rows: readonly Pick<LogSetRow, "prescriptionPosition" | "done">[],
): Map<number, number> {
  const attempted = new Map<number, number>();
  for (const row of rows) {
    if (!row.done) continue;
    attempted.set(
      row.prescriptionPosition,
      (attempted.get(row.prescriptionPosition) ?? 0) + 1,
    );
  }
  return attempted;
}

// Derive the Completion Outcome (Q8, ADR-0013): Completed iff every prescription has at least
// as many attempted (Done) sets as it prescribed; Incomplete if any prescribed set was left
// un-attempted (a set unchecked, or rows removed below the prescribed count). Extra Done sets
// beyond a prescription never make it Incomplete — they are bonus attempted work, not a gap.
export function deriveCompletionOutcome(
  prescribed: ReadonlyMap<number, number>,
  rows: readonly Pick<LogSetRow, "prescriptionPosition" | "done">[],
): CompletionOutcome {
  const attempted = attemptedByPosition(rows);
  for (const [position, count] of prescribed) {
    if ((attempted.get(position) ?? 0) < count) return "incomplete";
  }
  return "completed";
}

// How many prescribed sets were left un-attempted — the honest reason behind an Incomplete
// verdict, surfaced in the "Will log as…" indicator (Q11). Zero when Completed.
export function skippedSetCount(
  prescribed: ReadonlyMap<number, number>,
  rows: readonly Pick<LogSetRow, "prescriptionPosition" | "done">[],
): number {
  const attempted = attemptedByPosition(rows);
  let skipped = 0;
  for (const [position, count] of prescribed) {
    const done = attempted.get(position) ?? 0;
    if (done < count) skipped += count - done;
  }
  return skipped;
}

// --- Per-set payload building (ADR-0050). The plan-backed log's twin of
// `hand-authored-session`'s `performedAmount`/`buildPerformedSet`: a pure, kind-dispatching
// builder that turns a submitted row into a typed `LogSetInput` via the *shared* quantity
// request builders (`repetitionsInput`/`distanceInput`/`durationInput`) — the same ones the
// ad-hoc and Hand-Authored paths use. Moving it here leaves the log server action a thin
// caller and puts the "which field, which kind, reject-or-skip?" rules under unit test.

// The quantity fields a submitted row carries. Only the field its `kind` names is meaningful;
// the rest ride as they came off the form. This is the reader's output and the builder's
// input — the record-side `LogSetInput` is assembled from it plus the load and RPE.
export interface LogRowFields {
  exerciseId: number;
  kind: QuantityKind;
  reps: string;
  distance: string;
  unit: DistanceUnit;
  duration: string;
  loadKind: string;
  loadValue: string;
  rpe: string;
}

// The three log-set request builders return the same quantity-field slice the record
// endpoint accepts; distance widens it with unit + optional companion time.
type QuantityFields = Pick<
  LogSetInput,
  "quantity_kind" | "quantity_value" | "quantity_unit" | "quantity_duration"
>;

// A row's quantity after mapping: the typed fields, a silent skip (the row is not a real
// set), or a form-level error (a garbled value the user must fix before anything saves).
type QuantityResult =
  | { status: "quantity"; fields: QuantityFields }
  | { status: "skip" }
  | { status: "error"; error: string };

// The repetitions quantity — unchanged from the old server action (regression guard): a Done
// row with a blank reps field logs as 0 reps (a set ground out to failure is still attempted,
// CONTEXT 'Completion Outcome'), and a non-integer/negative value drops the set silently.
function repetitionsQuantity(row: LogRowFields): QuantityResult {
  const raw = row.reps.trim();
  const reps = raw === "" ? 0 : Number(raw);
  if (!Number.isInteger(reps) || reps < 0) return { status: "skip" };
  return { status: "quantity", fields: repetitionsInput(reps) };
}

// The distance quantity: a blank distance means the row was not performed and is skipped —
// so an added-but-unfilled extra set never blocks the log — while a *garbled* or non-positive
// value (the user typed something, but nonsense) is rejected with a clear message rather than
// silently dropped. This mirrors the ad-hoc/Hand-Authored distinction (blank → skip, garbage
// → error). The companion time stays optional: blank leaves pace underivable for a
// distance-only run, which logs fine (issue #343).
function distanceQuantity(row: LogRowFields): QuantityResult {
  const raw = row.distance.trim();
  if (raw === "") return { status: "skip" };

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      status: "error",
      error: "Enter a valid distance (like 5 or 3.1) for each distance set you did.",
    };
  }
  return { status: "quantity", fields: distanceInput(raw, row.unit, row.duration) };
}

// The duration quantity: a blank hold time skips the row (an unfilled extra set never blocks
// the log); a garbled or non-positive time is rejected outright. The text rides verbatim as a
// `duration` Quantity the backend canonicalises to seconds.
function durationQuantity(row: LogRowFields): QuantityResult {
  const raw = row.duration.trim();
  if (raw === "") return { status: "skip" };

  const seconds = parseDurationSeconds(raw);
  if (seconds === null || seconds <= 0) {
    return {
      status: "error",
      error: "Enter a valid hold time (like 45 or 1:30) for each duration set you did.",
    };
  }
  return { status: "quantity", fields: durationInput(raw) };
}

// Dispatch to the quantity mapper for the row's kind (ADR-0050), defaulting to repetitions.
function quantityFor(row: LogRowFields): QuantityResult {
  switch (row.kind) {
    case "distance":
      return distanceQuantity(row);
    case "duration":
      return durationQuantity(row);
    default:
      return repetitionsQuantity(row);
  }
}

// The in-range perceived difficulty (the 1–10 "RPE" scale) for a row, or null when blank or
// out of range — the same tolerance the old server action kept.
function perceivedDifficulty(rpe: string): number | null {
  const raw = rpe.trim();
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= MIN_RPE && value <= MAX_RPE ? value : null;
}

// A built set, a silent skip (the row was not a real set), or a form-level error.
export type LogSetResult =
  | { status: "set"; set: LogSetInput }
  | { status: "skip" }
  | { status: "error"; error: string };

// Build one logged-set payload from a submitted row, dispatching on its kind. The typed
// quantity rides as a Quantity (distance also carrying its unit + optional companion time);
// the load kind+value (blank value → no load recorded) and an in-range RPE ride alongside.
// Load is passed through whenever a value is present — a distance/duration set omits it by
// default on screen, but a loaded carry the user entered still reaches the record.
export function buildLogSet(row: LogRowFields): LogSetResult {
  if (!Number.isInteger(row.exerciseId)) return { status: "skip" };

  const quantity = quantityFor(row);
  if (quantity.status !== "quantity") return quantity;

  const loadValue = row.loadValue.trim();
  return {
    status: "set",
    set: {
      exercise_id: row.exerciseId,
      ...quantity.fields,
      load_kind: (row.loadKind || "absolute") as LogSetInput["load_kind"],
      load_value: loadValue === "" ? null : loadValue,
      perceived_difficulty: perceivedDifficulty(row.rpe),
    },
  };
}

// Build the whole logged-set list from the submitted rows, or the first form-level error. A
// garbled distance/duration rejects the entire submission so nothing corrupt is saved; a
// silently-skipped row (malformed reps, non-integer exercise) is simply omitted.
export function buildLoggedSets(
  rows: readonly LogRowFields[],
): { ok: true; sets: LogSetInput[] } | { ok: false; error: string } {
  const sets: LogSetInput[] = [];
  for (const row of rows) {
    const result = buildLogSet(row);
    if (result.status === "error") return { ok: false, error: result.error };
    if (result.status === "set") sets.push(result.set);
  }
  return { ok: true, sets };
}

function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Read the kind-aware log form into typed rows. Fields are indexed by row
// (`set-<i>-exercise_id`, `set-<i>-kind`, `set-<i>-distance`, …) under a `set_count` header —
// the same indexed shape the heterogeneous ad-hoc form uses, needed here because a hybrid
// run-then-squats Session mixes kinds and the old row-parallel `getAll` arrays would misalign.
// A row not marked done was skipped by the user (Model B, Q10) and is dropped, so only
// attempted sets reach the payload builder.
export function readLogFormRows(form: FormData): LogRowFields[] {
  const count = Number(readField(form, "set_count"));
  if (!Number.isInteger(count) || count <= 0) return [];

  const rows: LogRowFields[] = [];
  const bounded = Math.min(count, MAX_SET_ROWS);
  for (let index = 0; index < bounded; index += 1) {
    if (readField(form, `set-${index}-done`) !== "true") continue;
    rows.push({
      exerciseId: Number(readField(form, `set-${index}-exercise_id`)),
      kind: normalizeKind(readField(form, `set-${index}-kind`)),
      reps: readField(form, `set-${index}-reps`),
      distance: readField(form, `set-${index}-distance`),
      unit: (readField(form, `set-${index}-unit`) || DEFAULT_DISTANCE_UNIT) as DistanceUnit,
      duration: readField(form, `set-${index}-duration`),
      loadKind: readField(form, `set-${index}-load_kind`),
      loadValue: readField(form, `set-${index}-load_value`),
      rpe: readField(form, `set-${index}-rpe`),
    });
  }
  return rows;
}
