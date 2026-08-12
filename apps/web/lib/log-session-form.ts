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
import { supersetLayout, type SupersetSlot } from "./supersets.ts";
import type { ExercisePrescription } from "./sessions-types";

// Every prescription shows at least one row, even a malformed sets=0, so an exercise is never
// silently un-loggable.
const MIN_ROWS = 1;
const INTEGER = /^\d+$/;

// One editable set-row in the log form. `prescriptionPosition` ties the row back to the
// prescription it came from so Completion Outcome can compare attempted vs prescribed per
// prescription (not merely per exercise, which would conflate an exercise prescribed twice).
export interface LogSetRow {
  key: string;
  prescriptionPosition: number;
  exerciseId: number;
  setNumber: number;
  reps: string;
  loadKind: LoadKind;
  loadValue: string;
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
  // The prescribed reps string ("8-12", "AMRAP") shown as a placeholder when it cannot seed
  // a numeric field.
  repsHint: string;
  superset: SupersetSlot;
  rows: LogSetRow[];
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
    const reps = seededReps(prescription.reps);
    const count = prescribedRowCount(prescription);
    const rows: LogSetRow[] = Array.from({ length: count }, (_, set) => ({
      key: `${prescription.position}-${set}`,
      prescriptionPosition: prescription.position,
      exerciseId: prescription.exercise_id,
      setNumber: set + 1,
      reps,
      loadKind: seededLoad.loadKind,
      loadValue: seededLoad.loadValue,
      rpe: "",
      done: true,
    }));
    return {
      position: prescription.position,
      exerciseId: prescription.exercise_id,
      exerciseName: prescription.exercise_name,
      prescribedSets: count,
      repsHint: prescription.reps,
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
