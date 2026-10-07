import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLogForm,
  deriveCompletionOutcome,
  loggedSetRowsFromForm,
  prescribedByPosition,
  prescribedRowCount,
  seededReps,
  skippedSetCount,
  type LogPrescriptionGroup,
  type LogSetRow,
} from "./log-session-form.ts";
import type { ExercisePrescription } from "./sessions-types.ts";
import type { Quantity } from "./quantity.ts";

// `log-session-form` expands a Session's prescriptions into the per-set rows the static log
// form records, and derives the Completion Outcome from what the user marked done. The old
// form collapsed each prescription to one ungrouped row (losing the set count and the
// Supersets) and hardcoded "completed"; these tests pin the fidelity and the derivation.

function prescription(
  overrides: Partial<ExercisePrescription>,
): ExercisePrescription {
  return {
    position: 0,
    sets: 3,
    reps: "8",
    rest_seconds: null,
    tempo: null,
    recommended_load: null,
    exercise_id: 1,
    exercise_name: "Back Squat",
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "ai_generated",
    ...overrides,
  };
}

test("expands a prescription into one row per prescribed set", () => {
  // Arrange — a 4-set prescription
  const [group] = buildLogForm([prescription({ sets: 4 })], "kg");

  // Assert — four rows, numbered 1..4, all Done by default (Model B)
  assert.equal(group.rows.length, 4);
  assert.deepEqual(
    group.rows.map((row) => row.setNumber),
    [1, 2, 3, 4],
  );
  assert.ok(group.rows.every((row) => row.done));
});

test("seeds reps from a clean integer, and leaves a range blank with a hint", () => {
  // Arrange — one integer-reps prescription and one range-reps prescription
  const groups = buildLogForm([
    prescription({ position: 0, reps: "5", sets: 1 }),
    prescription({ position: 1, reps: "8-12", sets: 1 }),
  ], "kg");

  // Assert — the integer seeds the field; the range cannot fill a number input, so the
  // field is blank and the prescribed reps ride as the placeholder hint
  assert.equal(groups[0].rows[0].reps, "5");
  assert.equal(groups[1].rows[0].reps, "");
  assert.equal(groups[1].hint, "8-12");
});

test("seeds the load kind and value from the prescribed Load", () => {
  // Arrange — a percent-of-1RM prescribed load
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      recommended_load: { kind: "percent_1rm", text: "70% 1RM", percent: 70 },
    }),
  ], "kg");

  // Assert — the picker starts on the prescribed kind and value, editable
  assert.equal(group.rows[0].loadKind, "percent_1rm");
  assert.equal(group.rows[0].loadValue, "70");
});

test("carries the cosmetic Superset layout onto the groups", () => {
  // Arrange — two contiguous members of one Superset (ADR-0023)
  const groups = buildLogForm([
    prescription({ position: 0, exercise_id: 1, superset_group: "A", round_rest_seconds: 90 }),
    prescription({ position: 1, exercise_id: 2, superset_group: "A", round_rest_seconds: 90 }),
  ], "kg");

  // Assert — the lettered badge is derived for display; the record model is untouched
  assert.equal(groups[0].superset.memberLabel, "A");
  assert.equal(groups[1].superset.memberLabel, "B");
});

test("shows at least one row for a malformed zero-set prescription", () => {
  assert.equal(prescribedRowCount(prescription({ sets: 0 })), 1);
  assert.equal(buildLogForm([prescription({ sets: 0 })], "kg")[0].rows.length, 1);
});

test("seededReps keeps integers and drops non-numeric prescriptions", () => {
  assert.equal(seededReps("5"), "5");
  assert.equal(seededReps(" 12 "), "12");
  assert.equal(seededReps("8-12"), "");
  assert.equal(seededReps("AMRAP"), "");
});

test("derives Completed when every prescribed set is attempted", () => {
  // Arrange — a 3-set prescription, all three Done
  const groups = buildLogForm([prescription({ sets: 3 })], "kg");
  const rows = groups.flatMap((group) => group.rows);

  // Act / Assert
  const outcome = deriveCompletionOutcome(prescribedByPosition(groups), rows);
  assert.equal(outcome, "completed");
  assert.equal(skippedSetCount(prescribedByPosition(groups), rows), 0);
});

test("derives Incomplete when a prescribed set is left un-attempted", () => {
  // Arrange — a 3-set prescription with the last set unchecked (skipped)
  const groups = buildLogForm([prescription({ sets: 3 })], "kg");
  const prescribed = prescribedByPosition(groups);
  const rows = groups.flatMap((group) =>
    group.rows.map((row, index) => ({ ...row, done: index !== 2 })),
  );

  // Act / Assert — one prescribed set un-attempted → Incomplete, and it is counted
  assert.equal(deriveCompletionOutcome(prescribed, rows), "incomplete");
  assert.equal(skippedSetCount(prescribed, rows), 1);
});

test("extra Done sets beyond the prescription never make it Incomplete", () => {
  // Arrange — a 2-set prescription with a third (extra) Done set added
  const groups = buildLogForm([prescription({ sets: 2 })], "kg");
  const prescribed = prescribedByPosition(groups);
  const rows = [
    ...groups[0].rows,
    { ...groups[0].rows[0], key: "extra", setNumber: 3 },
  ];

  // Act / Assert — bonus attempted work, still Completed
  assert.equal(deriveCompletionOutcome(prescribed, rows), "completed");
  assert.equal(skippedSetCount(prescribed, rows), 0);
});

test("counts a whole skipped exercise's prescribed sets as un-attempted", () => {
  // Arrange — two exercises; the second is entirely unchecked
  const groups = buildLogForm([
    prescription({ position: 0, exercise_id: 1, sets: 2 }),
    prescription({ position: 1, exercise_id: 2, sets: 3 }),
  ], "kg");
  const prescribed = prescribedByPosition(groups);
  const rows = groups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, done: group.position === 0 })),
  );

  // Act / Assert — three prescribed sets left un-attempted
  assert.equal(deriveCompletionOutcome(prescribed, rows), "incomplete");
  assert.equal(skippedSetCount(prescribed, rows), 3);
});

// --- Kind-aware seeding (ADR-0050, issue #343): buildLogForm reads the typed Prescribed
// Quantity and seeds each row with the matching kind/value/unit, so a reused run lands on a
// distance field pre-filled with the prescribed distance.

const distanceQuantity: Quantity = { kind: "distance", text: "7 KM", metres: 7000 };
const durationQuantity: Quantity = { kind: "duration", text: "45s", seconds: 45 };

test("seeds a distance row with the prescribed value, unit, and blank companion time", () => {
  // Arrange — a "1 × 7 KM" running prescription
  const [group] = buildLogForm([
    prescription({ sets: 1, reps: "7 KM", prescribed_quantity: distanceQuantity }),
  ], "kg");

  // Assert — the row is a distance kind, the field pre-filled with 7 km, no time yet
  assert.equal(group.kind, "distance");
  assert.equal(group.rows[0].kind, "distance");
  assert.equal(group.rows[0].distance, "7");
  assert.equal(group.rows[0].unit, "km");
  assert.equal(group.rows[0].duration, "");
  assert.equal(group.rows[0].reps, "");
});

test("seeds a miles distance value from canonical metres without float noise", () => {
  // Arrange — 3.1 miles prescribed, stored canonically in metres
  const milesQuantity: Quantity = {
    kind: "distance",
    text: "3.1 mi",
    metres: 3.1 * 1609.344,
  };
  const [group] = buildLogForm([
    prescription({ sets: 1, reps: "3.1 mi", prescribed_quantity: milesQuantity }),
  ], "kg");

  // Assert — reads back as "3.1 mi", not "3.0999…"
  assert.equal(group.rows[0].distance, "3.1");
  assert.equal(group.rows[0].unit, "mi");
});

test("seeds a duration row's hold time from canonical seconds", () => {
  // Arrange — a 45-second plank hold prescribed
  const [group] = buildLogForm([
    prescription({ sets: 1, reps: "45s", prescribed_quantity: durationQuantity }),
  ], "kg");

  // Assert — a duration kind seeded with the hold time in mm:ss (matching the field's
  // placeholder); the verbatim "45s" stays the hint
  assert.equal(group.kind, "duration");
  assert.equal(group.rows[0].kind, "duration");
  assert.equal(group.rows[0].duration, "0:45");
  assert.equal(group.hint, "45s");
});

test("seeds a minutes-long hold as mm:ss (90s → 1:30)", () => {
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      reps: "1:30",
      prescribed_quantity: { kind: "duration", text: "1:30", seconds: 90 },
    }),
  ], "kg");
  assert.equal(group.rows[0].duration, "1:30");
});

test("leaves a repetitions prescription unchanged when no typed Quantity is present", () => {
  // Arrange — a legacy/strength prescription with no prescribed_quantity
  const [group] = buildLogForm([prescription({ sets: 1, reps: "8" })], "kg");

  // Assert — reps kind, reps seeded as before, distance/duration empty
  assert.equal(group.kind, "repetitions");
  assert.equal(group.rows[0].reps, "8");
  assert.equal(group.rows[0].distance, "");
  assert.equal(group.rows[0].duration, "");
});

test("hides the Load block by default for distance/duration but keeps it for reps", () => {
  const groups = buildLogForm([
    prescription({ position: 0, sets: 1, reps: "7 KM", prescribed_quantity: distanceQuantity }),
    prescription({ position: 1, sets: 1, reps: "45s", prescribed_quantity: durationQuantity }),
    prescription({ position: 2, sets: 1, reps: "8" }),
  ], "kg");

  assert.equal(groups[0].rows[0].showLoad, false);
  assert.equal(groups[1].rows[0].showLoad, false);
  assert.equal(groups[2].rows[0].showLoad, true);
});

test("keeps the Load block for a loaded carry — a distance set with a prescribed load", () => {
  // Arrange — a weighted-carry run: distance kind, but a load is explicitly prescribed
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      reps: "1 KM",
      prescribed_quantity: { kind: "distance", text: "1 KM", metres: 1000 },
      recommended_load: { kind: "absolute", text: "20kg", kg: 20 },
    }),
  ], "kg");

  // Assert — Load stays visible and seeded, since the plan asked for it
  assert.equal(group.rows[0].showLoad, true);
  assert.equal(group.rows[0].loadKind, "absolute");
  assert.equal(group.rows[0].loadValue, "20");
});

// --- Which posted rows count (ADR-0115): the Done ones. Building each row is the shared
// `logged-set` module's job and is tested there.

test("loggedSetRowsFromForm keeps only Done rows with an Exercise id", () => {
  // Arrange
  const form = new FormData();
  form.set("set_count", "3");
  form.set("set-0-done", "true");
  form.set("set-0-exercise_id", "1");
  form.set("set-0-kind", "distance");
  form.set("set-0-distance", "5");
  form.set("set-1-done", "false");
  form.set("set-1-exercise_id", "2");
  form.set("set-1-reps", "10");
  form.set("set-2-done", "true");
  form.set("set-2-reps", "8");

  // Act
  const rows = loggedSetRowsFromForm(form);

  // Assert — the skipped row and the id-less row never reach the builder
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exerciseId, 1);
  assert.equal(rows[0].values.kind, "distance");
  assert.equal(rows[0].values.distance, "5");
});
