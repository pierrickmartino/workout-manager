import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLogForm,
  deriveCompletionOutcome,
  prescribedByPosition,
  prescribedRowCount,
  seededReps,
  skippedSetCount,
} from "./log-session-form.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

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
  const [group] = buildLogForm([prescription({ sets: 4 })]);

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
  ]);

  // Assert — the integer seeds the field; the range cannot fill a number input, so the
  // field is blank and the prescribed reps ride as the placeholder hint
  assert.equal(groups[0].rows[0].reps, "5");
  assert.equal(groups[1].rows[0].reps, "");
  assert.equal(groups[1].repsHint, "8-12");
});

test("seeds the load kind and value from the prescribed Load", () => {
  // Arrange — a percent-of-1RM prescribed load
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      recommended_load: { kind: "percent_1rm", text: "70% 1RM", percent: 70 },
    }),
  ]);

  // Assert — the picker starts on the prescribed kind and value, editable
  assert.equal(group.rows[0].loadKind, "percent_1rm");
  assert.equal(group.rows[0].loadValue, "70");
});

test("carries the cosmetic Superset layout onto the groups", () => {
  // Arrange — two contiguous members of one Superset (ADR-0023)
  const groups = buildLogForm([
    prescription({ position: 0, exercise_id: 1, superset_group: "A", round_rest_seconds: 90 }),
    prescription({ position: 1, exercise_id: 2, superset_group: "A", round_rest_seconds: 90 }),
  ]);

  // Assert — the lettered badge is derived for display; the record model is untouched
  assert.equal(groups[0].superset.memberLabel, "A");
  assert.equal(groups[1].superset.memberLabel, "B");
});

test("shows at least one row for a malformed zero-set prescription", () => {
  assert.equal(prescribedRowCount(prescription({ sets: 0 })), 1);
  assert.equal(buildLogForm([prescription({ sets: 0 })])[0].rows.length, 1);
});

test("seededReps keeps integers and drops non-numeric prescriptions", () => {
  assert.equal(seededReps("5"), "5");
  assert.equal(seededReps(" 12 "), "12");
  assert.equal(seededReps("8-12"), "");
  assert.equal(seededReps("AMRAP"), "");
});

test("derives Completed when every prescribed set is attempted", () => {
  // Arrange — a 3-set prescription, all three Done
  const groups = buildLogForm([prescription({ sets: 3 })]);
  const rows = groups.flatMap((group) => group.rows);

  // Act / Assert
  const outcome = deriveCompletionOutcome(prescribedByPosition(groups), rows);
  assert.equal(outcome, "completed");
  assert.equal(skippedSetCount(prescribedByPosition(groups), rows), 0);
});

test("derives Incomplete when a prescribed set is left un-attempted", () => {
  // Arrange — a 3-set prescription with the last set unchecked (skipped)
  const groups = buildLogForm([prescription({ sets: 3 })]);
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
  const groups = buildLogForm([prescription({ sets: 2 })]);
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
  ]);
  const prescribed = prescribedByPosition(groups);
  const rows = groups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, done: group.position === 0 })),
  );

  // Act / Assert — three prescribed sets left un-attempted
  assert.equal(deriveCompletionOutcome(prescribed, rows), "incomplete");
  assert.equal(skippedSetCount(prescribed, rows), 3);
});
