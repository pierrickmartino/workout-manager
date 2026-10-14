import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildEditPlanRequest,
  editSeedFromSession,
  isEditDraft,
  makeEditRow,
  sessionEditView,
  type EditPlanRow,
} from "./session-edit.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";

// The Edit view-model (ADR-0133): a standalone Session folds into the Hand-Authored editor's
// rows faithfully (every authored field, decoded note, carried scheme), and the edited rows
// fold back into the replace-plan request with each row's scheme riding along.

function prescription(overrides: Partial<ExercisePrescription> = {}): ExercisePrescription {
  return {
    position: 0,
    sets: 5,
    reps: "5",
    rest_seconds: 180,
    tempo: "3-1-1",
    recommended_load: { kind: "absolute", text: "100 kg", kg: 100 },
    prescribed_quantity: { kind: "repetitions", text: "5", count: 5 },
    superset_group: null,
    round_rest_seconds: null,
    scheme: "static",
    set_type: "warm_up",
    target_effort: { scale: "rir", value: 2 },
    note: "Brace &amp; breathe",
    exercise_id: 11,
    exercise_name: "Back Squat",
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "ai_generated",
    ...overrides,
  };
}

function session(prescriptions: ExercisePrescription[], overrides = {}): WorkoutSession {
  return {
    id: 7,
    training_type: "strength",
    duration_minutes: 45,
    is_protocol_member: false,
    prescriptions,
    ...overrides,
  } as WorkoutSession;
}

test("editSeedFromSession folds every authored field into an editor row", () => {
  // Arrange / Act
  const seed = editSeedFromSession(session([prescription()]), "kg");

  // Assert
  assert.equal(seed.trainingType, "strength");
  const [row] = seed.rows;
  assert.equal(row.exerciseId, 11);
  assert.equal(row.exerciseName, "Back Squat");
  assert.equal(row.kind, "repetitions");
  assert.equal(row.sets, "5");
  assert.equal(row.reps, "5");
  assert.equal(row.restSeconds, "180");
  assert.equal(row.tempo, "3-1-1");
  assert.equal(row.setType, "warm_up");
  assert.equal(row.targetEffortScale, "rir");
  assert.equal(row.targetEffortValue, "2");
  assert.equal(row.loadKind, "absolute");
  assert.equal(row.loadValue, "100");
  assert.equal(row.scheme, "static");
});

test("editSeedFromSession decodes the stored note so a save never double-escapes it", () => {
  const [row] = editSeedFromSession(session([prescription()]), "kg").rows;

  assert.equal(row.note, "Brace & breathe");
});

test("editSeedFromSession leaves absent optional fields blank", () => {
  // Arrange — a bare generated movement
  const bare = prescription({
    rest_seconds: null,
    tempo: null,
    recommended_load: null,
    scheme: null,
    set_type: null,
    target_effort: null,
    note: null,
  });

  // Act
  const [row] = editSeedFromSession(session([bare]), "kg").rows;

  // Assert
  assert.equal(row.restSeconds, "");
  assert.equal(row.tempo, "");
  assert.equal(row.setType, "");
  assert.equal(row.note, "");
  assert.equal(row.targetEffortValue, "");
  assert.equal(row.targetEffortScale, "rpe");
  assert.equal(row.loadValue, "");
  assert.equal(row.scheme, null);
});

test("editSeedFromSession keeps a distance movement's kind and unit", () => {
  const run = prescription({
    reps: "3 mi",
    prescribed_quantity: { kind: "distance", text: "3 mi", metres: 4828 },
    recommended_load: null,
  });

  const [row] = editSeedFromSession(session([run]), "kg").rows;

  assert.equal(row.kind, "distance");
  assert.equal(row.unit, "mi");
});

test("editSeedFromSession keeps a superset's grouping and round-rest", () => {
  const rows = editSeedFromSession(
    session([
      prescription({ superset_group: "A", round_rest_seconds: 90 }),
      prescription({ position: 1, exercise_id: 12, superset_group: "A", round_rest_seconds: 90 }),
    ]),
    "kg",
  ).rows;

  assert.deepEqual(
    rows.map((row) => [row.supersetGroup, row.roundRestSeconds]),
    [["A", 90], ["A", 90]],
  );
});

test("editSeedFromSession gives every row a distinct key", () => {
  const rows = editSeedFromSession(
    session([prescription(), prescription({ position: 1, exercise_id: 12 })]),
    "kg",
  ).rows;

  assert.notEqual(rows[0].key, rows[1].key);
});

test("buildEditPlanRequest keeps the edited order and carries each row's scheme", () => {
  // Arrange — seed two rows, then reverse them and re-dose the first
  const rows = editSeedFromSession(
    session([
      prescription(),
      prescription({ position: 1, exercise_id: 12, exercise_name: "Bench", scheme: null }),
    ]),
    "kg",
  ).rows;
  const edited: EditPlanRow[] = [{ ...rows[1], sets: "4", reps: "6" }, rows[0]];

  // Act
  const result = buildEditPlanRequest({ trainingType: "hiit", rows: edited }, "kg");

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.training_type, "hiit");
  assert.deepEqual(
    result.request.prescriptions.map((p) => [p.exercise_id, p.sets, p.reps, p.scheme]),
    [
      [12, 4, "6", null],
      [11, 5, "5", "static"],
    ],
  );
});

test("buildEditPlanRequest surfaces the shared plan validation", () => {
  const [row] = editSeedFromSession(session([prescription()]), "kg").rows;

  const result = buildEditPlanRequest(
    { trainingType: "strength", rows: [{ ...row, sets: "0" }] },
    "kg",
  );

  assert.deepEqual(result, { ok: false, error: "Each exercise needs at least one set." });
});

test("makeEditRow starts a newly added movement with no scheme", () => {
  const row = makeEditRow({ id: 3, name: "Lunge" } as Parameters<typeof makeEditRow>[0]);

  assert.equal(row.exerciseId, 3);
  assert.equal(row.scheme, null);
});

test("isEditDraft accepts a stored edit draft and rejects a malformed scheme", () => {
  const rows = editSeedFromSession(session([prescription()]), "kg").rows;

  assert.equal(isEditDraft({ trainingType: "strength", exercises: rows }), true);
  assert.equal(
    isEditDraft({ trainingType: "strength", exercises: [{ ...rows[0], scheme: 4 }] }),
    false,
  );
});

test("sessionEditView offers Edit on a standalone Session only", () => {
  assert.deepEqual(sessionEditView(session([prescription()])), {
    show: true,
    href: "/sessions/7/edit",
  });
  assert.deepEqual(
    sessionEditView(session([prescription()], { is_protocol_member: true })),
    { show: false, href: "/sessions/7/edit" },
  );
});
