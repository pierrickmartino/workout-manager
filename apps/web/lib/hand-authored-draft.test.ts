import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addPerformedSet,
  highestDraftKey,
  isLogDraft,
  isPlanDraft,
  makeLoggedRow,
  makePlanRow,
  removePerformedSet,
  renderRuns,
  seededPlanRow,
  toAuthoredFields,
  updatePerformedSet,
} from "./hand-authored-draft.ts";

// The two Hand-Authored forms share one draft vocabulary (audit C-1): a plan row, and a logged
// row that adds the sets performed. These pin the pieces the split moved out of the component.

const SQUAT = { id: 7, name: "Back Squat" };
const UUID = "123e4567-e89b-42d3-a456-426614174000";

test("a plan row carries no record half, a logged row starts with one performed set", () => {
  // Arrange / Act
  const plan = makePlanRow(SQUAT);
  const logged = makeLoggedRow(SQUAT);

  // Assert
  assert.equal("performedSets" in plan, false);
  assert.equal(logged.performedSets.length, 1);
  assert.equal(logged.exerciseName, "Back Squat");
});

test("a seeded plan row keeps what the record knew and leaves the plan-only fields blank", () => {
  // Arrange / Act
  const row = seededPlanRow({
    exerciseId: 7, exerciseName: "Back Squat", kind: "repetitions", unit: "km", sets: "3",
    reps: "5", loadKind: "absolute", loadValue: "100",
  });

  // Assert
  assert.equal(row.reps, "5");
  assert.equal(row.loadValue, "100");
  assert.equal(row.restSeconds, "");
  assert.equal(row.note, "");
  assert.equal(row.supersetGroup, null);
});

test("a plan row maps to request fields with no performed sets", () => {
  // Arrange / Act
  const fields = toAuthoredFields(makePlanRow(SQUAT));

  // Assert
  assert.deepEqual(fields.performedSets, []);
  assert.equal(fields.exerciseId, 7);
});

test("performed-set edits return new rows and keep at least one set", () => {
  // Arrange
  const rows = [makeLoggedRow(SQUAT)];
  const key = rows[0].key;

  // Act
  const added = addPerformedSet(rows, key);
  const setKey = added[0].performedSets[1].key;
  const edited = updatePerformedSet(added, key, setKey, { reps: "8" });
  const removed = removePerformedSet(edited, key, setKey);
  const last = removePerformedSet(removed, key, removed[0].performedSets[0].key);

  // Assert
  assert.equal(rows[0].performedSets.length, 1, "the input is never mutated");
  assert.equal(added[0].performedSets.length, 2);
  assert.equal(edited[0].performedSets[1].reps, "8");
  assert.equal(removed[0].performedSets.length, 1);
  assert.equal(last[0].performedSets.length, 1, "the last set cannot be removed");
});

test("the highest draft key counts performed-set keys too", () => {
  // Arrange
  const row = { ...makeLoggedRow(SQUAT), key: 3 };
  const withSets = { ...row, performedSets: [{ ...row.performedSets[0], key: 41 }] };

  // Act / Assert
  assert.equal(highestDraftKey([withSets]), 41);
  assert.equal(highestDraftKey([{ ...makePlanRow(SQUAT), key: 9 }]), 9);
});

test("a log draft needs its date, idempotency key and performed sets", () => {
  // Arrange
  const logged = makeLoggedRow(SQUAT);
  const draft = {
    idempotencyKey: UUID, performedOn: "2026-10-01", trainingType: "strength",
    exercises: [logged],
  };

  // Act / Assert
  assert.ok(isLogDraft(draft));
  assert.equal(isLogDraft({ ...draft, performedOn: "yesterday" }), false);
  assert.equal(isLogDraft({ ...draft, exercises: [makePlanRow(SQUAT)] }), false);
  assert.equal(isLogDraft({ ...draft, exercises: [{ ...logged, performedSets: [] }] }), false);
});

test("a plan draft needs neither, and a draft saved before the split still restores", () => {
  // Arrange
  const plan = { trainingType: "strength", exercises: [makePlanRow(SQUAT)] };
  const legacy = {
    idempotencyKey: UUID, performedOn: "2026-10-01", trainingType: "strength",
    exercises: [makeLoggedRow(SQUAT)],
  };

  // Act / Assert
  assert.ok(isPlanDraft(plan));
  assert.ok(isPlanDraft(legacy));
  assert.equal(isPlanDraft({ ...plan, trainingType: "juggling" }), false);
  assert.equal(isPlanDraft({ ...plan, exercises: [{ ...plan.exercises[0], kind: "laps" }] }), false);
});

test("render runs bracket a contiguous Superset and leave solo rows alone", () => {
  // Arrange
  const slot = (group: string | null) => ({
    group, memberLabel: null, isFirstMember: false, isLastMember: false, groupSize: 0,
    roundRestSeconds: null, canGroupWithNext: false,
  });

  // Act
  const runs = renderRuns([slot(null), slot("a"), slot("a"), slot(null)]);

  // Assert
  assert.deepEqual(runs, [
    { kind: "solo", index: 0 },
    { kind: "group", group: "a", indices: [1, 2] },
    { kind: "solo", index: 3 },
  ]);
});
