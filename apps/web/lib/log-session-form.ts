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

import type { CompletionOutcome } from "./logs-types";
import { loadToFields, type LoadKind } from "./load.ts";
import type { WeightUnit } from "./weight-unit";
import {
  distanceValueFromMetres,
  distanceUnitFromText,
  formatSecondsAsClock,
  type DistanceUnit,
  type Quantity,
  type QuantityKind,
} from "./quantity.ts";
import { readPostedSetRows, type LoggedSetRow } from "./logged-set.ts";
import { supersetLayout, type SupersetSlot } from "./supersets.ts";
import type { ExercisePrescription } from "./sessions-types";

// Every prescription shows at least one row, even a malformed sets=0, so an exercise is never
// silently un-loggable.
const MIN_ROWS = 1;
const INTEGER = /^\d+$/;

// A `distance` set's unit falls back to km when none can be read — the same default the
// ad-hoc and Hand-Authored logs use (ADR-0032).
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

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
  // The Set Note (ADR-0065, #451): the user's optional per-set remark, edited inline in the log
  // form. Blank means no note; the backend length-caps and HTML-escapes a present note at the
  // write boundary. Starts empty — a plan never seeds a record's note.
  note: string;
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
  unit: WeightUnit,
): LogPrescriptionGroup[] {
  const slots = supersetLayout(
    prescriptions.map((prescription) => ({
      supersetGroup: prescription.superset_group ?? null,
      roundRestSeconds: prescription.round_rest_seconds ?? null,
    })),
  );

  return prescriptions.map((prescription, index) => {
    const seededLoad = loadToFields(prescription.recommended_load ?? null, unit);
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
      note: "",
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

// --- The submitted form → Logged Set rows. Turning a row into a request is the shared
// `logged-set` module's job (ADR-0115); what is particular to this path is which posted rows
// count. A row not marked Done was skipped by the user (Model B, Q10) and is dropped, so only
// attempted sets reach the builder, which this path calls with `performedMark` — a Done row
// with a blank rep count logs as 0 reps.
export function loggedSetRowsFromForm(form: FormData): LoggedSetRow[] {
  return readPostedSetRows(form).flatMap((posted) =>
    posted.done === true && posted.exerciseId !== null
      ? [{ exerciseId: posted.exerciseId, values: posted.values }]
      : [],
  );
}
