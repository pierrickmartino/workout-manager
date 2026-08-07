import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthorSessionRequest,
  type AuthorSessionFields,
  type AuthoredExerciseFields,
} from "./hand-authored-session.ts";

function exercise(
  overrides: Partial<AuthoredExerciseFields> = {},
): AuthoredExerciseFields {
  return {
    exerciseId: 7,
    sets: "3",
    reps: "5",
    restSeconds: "90",
    tempo: "3-1-1",
    loadKind: "absolute",
    loadValue: "100",
    performedSets: [{ reps: "5", loadKind: "absolute", loadValue: "100", perceivedDifficulty: "8" }],
    ...overrides,
  };
}

function fields(overrides: Partial<AuthorSessionFields> = {}): AuthorSessionFields {
  return {
    performedOn: "2026-06-20",
    trainingType: "strength",
    exercises: [exercise()],
    ...overrides,
  };
}

// Any date after the fixed `performedOn` above, so "today" makes the sample non-future.
const TODAY = "2026-06-21";

test("maps a plan and its first performance into the author-and-log payload", () => {
  // Arrange
  const input = fields();

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — the authored prescription and the recorded set ride together.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    performed_on: "2026-06-20",
    training_type: "strength",
    prescriptions: [
      {
        exercise_id: 7,
        sets: 3,
        reps: "5",
        rest_seconds: 90,
        tempo: "3-1-1",
        load_kind: "absolute",
        load_value: "100",
      },
    ],
    logged_sets: [
      {
        exercise_id: 7,
        quantity_kind: "repetitions",
        quantity_value: "5",
        load_kind: "absolute",
        load_value: "100",
        perceived_difficulty: 8,
      },
    ],
  });
});

test("carries a typed Load kind through to both the plan and the record", () => {
  // Arrange — a bodyweight-plus load on the plan and the recorded set.
  const input = fields({
    exercises: [
      exercise({
        loadKind: "bodyweight",
        loadValue: "20",
        performedSets: [{ reps: "6", loadKind: "bodyweight", loadValue: "20" }],
      }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].load_kind, "bodyweight");
  assert.equal(result.request.logged_sets[0].load_kind, "bodyweight");
});

test("records every performed set of an exercise", () => {
  // Arrange — three sets performed under one prescription.
  const input = fields({
    exercises: [
      exercise({
        performedSets: [{ reps: "5" }, { reps: "5" }, { reps: "4" }],
      }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 3);
  assert.deepEqual(
    result.request.logged_sets.map((set) => set.quantity_value),
    ["5", "5", "4"],
  );
});

test("skips performed-set rows left blank", () => {
  // Arrange — the middle set row was never filled in.
  const input = fields({
    exercises: [
      exercise({ performedSets: [{ reps: "5" }, { reps: "" }, { reps: "4" }] }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — only the two performed rows survive.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 2);
});

test("defaults an empty load to a null absolute load", () => {
  // Arrange — no load entered on the plan or the recorded set.
  const input = fields({
    exercises: [
      exercise({
        loadKind: "",
        loadValue: "",
        performedSets: [{ reps: "5" }],
      }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].load_kind, "absolute");
  assert.equal(result.request.prescriptions[0].load_value, null);
  assert.equal(result.request.logged_sets[0].load_value, null);
});

test("rejects a missing performed-on date", () => {
  const result = buildAuthorSessionRequest(fields({ performedOn: "" }), TODAY);
  assert.equal(result.ok, false);
});

test("rejects a future performed-on date", () => {
  // Arrange — a date after today.
  const result = buildAuthorSessionRequest(
    fields({ performedOn: "2026-06-22" }),
    TODAY,
  );

  // Assert
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /future/i);
});

test("accepts a performed-on date of today", () => {
  const result = buildAuthorSessionRequest(fields({ performedOn: TODAY }), TODAY);
  assert.equal(result.ok, true);
});

test("rejects an unknown training type", () => {
  const result = buildAuthorSessionRequest(
    fields({ trainingType: "nonsense" }),
    TODAY,
  );
  assert.equal(result.ok, false);
});

test("rejects a session with no exercises", () => {
  const result = buildAuthorSessionRequest(fields({ exercises: [] }), TODAY);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /at least one exercise/i);
});

test("rejects an exercise with a zero sets count", () => {
  const input = fields({ exercises: [exercise({ sets: "0" })] });
  const result = buildAuthorSessionRequest(input, TODAY);
  assert.equal(result.ok, false);
});

test("rejects an exercise with a blank rep target", () => {
  const input = fields({ exercises: [exercise({ reps: "  " })] });
  const result = buildAuthorSessionRequest(input, TODAY);
  assert.equal(result.ok, false);
});

test("rejects a session where nothing was performed", () => {
  // Arrange — a valid plan, but no set has reps recorded.
  const input = fields({
    exercises: [exercise({ performedSets: [{ reps: "" }] })],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /at least one set/i);
});

test("drops an out-of-range perceived difficulty rather than sending it", () => {
  // Arrange — an RPE above the 1–10 scale.
  const input = fields({
    exercises: [exercise({ performedSets: [{ reps: "5", perceivedDifficulty: "99" }] })],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — the set is still recorded, with no perceived difficulty.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets[0].perceived_difficulty, null);
});
