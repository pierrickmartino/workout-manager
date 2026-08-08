import { test } from "node:test";
import assert from "node:assert/strict";

import {
  authoredSupersetLayout,
  buildAuthorSessionRequest,
  groupExerciseWithNext,
  reorderExercise,
  setExerciseRoundRest,
  suppressAuthoredSupersets,
  ungroupExercise,
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
    supersetGroup: null,
    roundRestSeconds: null,
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
        superset_group: null,
        round_rest_seconds: null,
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

// --- Per-exercise Amount kind: Duration (ADR-0032, ADR-0040, issue #300) ---

// A duration exercise: its target is a free-text hold time and each performed set carries
// a time rather than a rep count. Reuses the base helper and overlays the duration shape.
function durationExercise(
  overrides: Partial<AuthoredExerciseFields> = {},
): AuthoredExerciseFields {
  return exercise({
    kind: "duration",
    reps: "45s",
    loadKind: "",
    loadValue: "",
    performedSets: [{ duration: "0:45" }],
    ...overrides,
  });
}

test("records a duration exercise's performed sets as duration Quantities", () => {
  // Arrange — a Dead hang held 45s per set, entered as mm:ss and bare seconds.
  const input = fields({
    exercises: [
      durationExercise({
        performedSets: [{ duration: "0:45" }, { duration: "45" }],
      }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — the plan target rides through as free text; each set is a duration Quantity.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].reps, "45s");
  assert.deepEqual(
    result.request.logged_sets.map((set) => [set.quantity_kind, set.quantity_value]),
    [
      ["duration", "0:45"],
      ["duration", "45"],
    ],
  );
});

test("defaults a duration exercise's Load to bodyweight on both plan and record", () => {
  // Arrange — no load entered; the kind, not the field, chooses the default.
  const input = fields({ exercises: [durationExercise()] });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].load_kind, "bodyweight");
  assert.equal(result.request.logged_sets[0].load_kind, "bodyweight");
});

test("keeps the absolute Load default for a reps exercise", () => {
  // Arrange — a plain reps exercise with no load kind entered.
  const input = fields({
    exercises: [exercise({ loadKind: "", loadValue: "", performedSets: [{ reps: "5" }] })],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — reps keeps the existing absolute default; duration never leaks in.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].load_kind, "absolute");
  assert.equal(result.request.logged_sets[0].load_kind, "absolute");
});

test("respects an explicit Load override on a duration exercise", () => {
  // Arrange — a weighted Dead hang: bodyweight-plus stays expressible via an override.
  const input = fields({
    exercises: [
      durationExercise({
        loadKind: "bodyweight",
        loadValue: "20",
        performedSets: [{ duration: "0:30", loadKind: "bodyweight", loadValue: "20" }],
      }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — the entered load kind and value ride through, not the default.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].load_value, "20");
  assert.equal(result.request.logged_sets[0].load_kind, "bodyweight");
  assert.equal(result.request.logged_sets[0].load_value, "20");
});

test("a duration exercise with a blank target errors without mentioning reps", () => {
  // Arrange — the plan needs a target for every kind, but the wording follows the kind.
  const input = fields({ exercises: [durationExercise({ reps: "  " })] });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — required-target still enforced; the message never says "rep".
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /target/i);
  assert.doesNotMatch(result.error, /rep/i);
});

test("skips a blank performed set on a duration exercise", () => {
  // Arrange — the middle set row was never filled in.
  const input = fields({
    exercises: [
      durationExercise({
        performedSets: [{ duration: "0:45" }, { duration: "" }, { duration: "1:00" }],
      }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — only the two performed rows survive.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 2);
});

test("rejects a malformed duration on a performed set", () => {
  // Arrange — a non-numeric hold time is a clear mistake, not a skip.
  const input = fields({
    exercises: [durationExercise({ performedSets: [{ duration: "a while" }] })],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /time/i);
});

test("rejects a non-positive duration on a performed set", () => {
  // Arrange — a zero-second hold is meaningless.
  const input = fields({
    exercises: [durationExercise({ performedSets: [{ duration: "0" }] })],
  });

  // Act / Assert
  const result = buildAuthorSessionRequest(input, TODAY);
  assert.equal(result.ok, false);
});

test("an all-blank duration form yields the kind-neutral no-set error", () => {
  // Arrange — a valid duration plan, but no set was recorded.
  const input = fields({
    exercises: [durationExercise({ performedSets: [{ duration: "" }] })],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — the error is amount-neutral, never demanding "reps".
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount for at least one set/i);
});

test("a mixed session records a duration hold alongside a rep set", () => {
  // Arrange — a Dead hang (duration) and Back Squat (reps) in one workout.
  const input = fields({
    exercises: [
      durationExercise({ exerciseId: 5 }),
      exercise({ exerciseId: 9, performedSets: [{ reps: "5" }] }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — each set is typed by its own exercise's kind.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.request.logged_sets.map((set) => set.quantity_kind),
    ["duration", "repetitions"],
  );
});

// --- Supersets on the authored plan (ADR-0023, issue #289) ---

test("carries a saved Superset's group tag and round-rest onto the prescriptions", () => {
  // Arrange — two grouped exercises sharing a tag and a round-rest; the record is
  // sets-only, so the grouping travels only on the plan.
  const input = fields({
    exercises: [
      exercise({ exerciseId: 7, supersetGroup: "1", roundRestSeconds: 120 }),
      exercise({ exerciseId: 9, supersetGroup: "1", roundRestSeconds: 120 }),
    ],
  });

  // Act
  const result = buildAuthorSessionRequest(input, TODAY);

  // Assert — both prescriptions carry the tag and round-rest; logged sets carry neither.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.request.prescriptions.map((p) => p.superset_group),
    ["1", "1"],
  );
  assert.deepEqual(
    result.request.prescriptions.map((p) => p.round_rest_seconds),
    [120, 120],
  );
  for (const loggedSet of result.request.logged_sets) {
    assert.equal("superset_group" in loggedSet, false);
    assert.equal("round_rest_seconds" in loggedSet, false);
  }
});

test("a solo exercise carries null superset fields in the payload", () => {
  const result = buildAuthorSessionRequest(fields(), TODAY);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.prescriptions[0].superset_group, null);
  assert.equal(result.request.prescriptions[0].round_rest_seconds, null);
});

test("groupExerciseWithNext groups two consecutive exercises with a seeded round-rest", () => {
  // Arrange — three solo exercises; the second one's rest (120) seeds the round-rest.
  const exercises = [
    exercise({ exerciseId: 1, restSeconds: "90" }),
    exercise({ exerciseId: 2, restSeconds: "120" }),
    exercise({ exerciseId: 3, restSeconds: "60" }),
  ];

  // Act — group the first with the next.
  const grouped = groupExerciseWithNext(exercises, 0);

  // Assert — the first two share a tag and the seeded round-rest; the third stays solo.
  assert.equal(grouped[0].supersetGroup, grouped[1].supersetGroup);
  assert.notEqual(grouped[0].supersetGroup, null);
  assert.equal(grouped[0].roundRestSeconds, 120);
  assert.equal(grouped[1].roundRestSeconds, 120);
  assert.equal(grouped[2].supersetGroup, null);
});

test("ungroupExercise dissolves the group and clears its round-rest", () => {
  // Arrange
  const exercises = [
    exercise({ exerciseId: 1, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 2, supersetGroup: "1", roundRestSeconds: 120 }),
  ];

  // Act
  const flat = ungroupExercise(exercises, 0);

  // Assert
  assert.deepEqual(
    flat.map((e) => e.supersetGroup),
    [null, null],
  );
  assert.deepEqual(
    flat.map((e) => e.roundRestSeconds),
    [null, null],
  );
});

test("setExerciseRoundRest applies to every member of the group", () => {
  // Arrange
  const exercises = [
    exercise({ exerciseId: 1, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 2, supersetGroup: "1", roundRestSeconds: 120 }),
  ];

  // Act — edit the round-rest from the second member.
  const edited = setExerciseRoundRest(exercises, 1, 75);

  // Assert
  assert.deepEqual(
    edited.map((e) => e.roundRestSeconds),
    [75, 75],
  );
});

test("reorderExercise refuses a move that would split a Superset", () => {
  // Arrange — exercises 1 and 2 grouped and contiguous; a solo 3 sits after them.
  const exercises = [
    exercise({ exerciseId: 1, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 2, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 3 }),
  ];

  // Act — try to wedge the solo exercise between the two group members.
  const result = reorderExercise(exercises, 2, 1);

  // Assert — the move is refused; the group stays contiguous and the order is unchanged.
  assert.equal(result, exercises);
});

test("reorderExercise moves a whole Superset without splitting it", () => {
  // Arrange — a solo exercise, then a grouped pair.
  const exercises = [
    exercise({ exerciseId: 3 }),
    exercise({ exerciseId: 1, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 2, supersetGroup: "1", roundRestSeconds: 120 }),
  ];

  // Act — move the group's opener ahead of the solo; its co-member follows to stay
  // contiguous is not automatic here, but moving the solo down is a clean reorder.
  const result = reorderExercise(exercises, 0, 2);

  // Assert — the group is still contiguous after the reorder.
  assert.equal(result[0].supersetGroup, "1");
  assert.equal(result[1].supersetGroup, "1");
  assert.equal(result[2].supersetGroup, null);
  assert.deepEqual(
    result.map((e) => e.exerciseId),
    [1, 2, 3],
  );
});

// --- Sensitive-Constraint superset suppression (ADR-0023, issue #290) ---

test("suppressAuthoredSupersets unlinks every Superset, restoring each exercise to solo", () => {
  // Arrange — a grouped pair (sharing a tag and round-rest) followed by a solo.
  const exercises = [
    exercise({ exerciseId: 1, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 2, supersetGroup: "1", roundRestSeconds: 120 }),
    exercise({ exerciseId: 3 }),
  ];

  // Act — the staged, not-committed unlink a Sensitive-Constraint screen applies.
  const flat = suppressAuthoredSupersets(exercises);

  // Assert — no exercise carries a group tag or round-rest anymore.
  assert.deepEqual(
    flat.map((e) => e.supersetGroup),
    [null, null, null],
  );
  assert.deepEqual(
    flat.map((e) => e.roundRestSeconds),
    [null, null, null],
  );
  // The non-structural fields (and the exercises' own rest) are untouched.
  assert.deepEqual(
    flat.map((e) => e.restSeconds),
    ["90", "90", "90"],
  );
});

test("suppressAuthoredSupersets leaves an already-flat draft unchanged and unmutated", () => {
  // Arrange — every exercise is solo already.
  const exercises = [exercise({ exerciseId: 1 }), exercise({ exerciseId: 2 })];

  // Act
  const flat = suppressAuthoredSupersets(exercises);

  // Assert — nothing to unlink; the original list is never mutated.
  assert.deepEqual(
    flat.map((e) => e.supersetGroup),
    [null, null],
  );
  assert.deepEqual(exercises, [exercise({ exerciseId: 1 }), exercise({ exerciseId: 2 })]);
});

test("authoredSupersetLayout closes every group-with-next gate when suppressed", () => {
  // Arrange — two consecutive solos: normally the first could group with the next.
  const exercises = [exercise({ exerciseId: 1 }), exercise({ exerciseId: 2 })];

  // Act — the suppressed layout the screen renders for a Sensitive-Constraint user.
  const layout = authoredSupersetLayout(exercises, true);

  // Assert — no exercise offers the "group with next" affordance.
  assert.deepEqual(
    layout.map((slot) => slot.canGroupWithNext),
    [false, false],
  );
});

test("authoredSupersetLayout still gates grouping normally when not suppressed", () => {
  // Arrange — two consecutive solos.
  const exercises = [exercise({ exerciseId: 1 }), exercise({ exerciseId: 2 })];

  // Act — the default (non-suppressed) layout.
  const layout = authoredSupersetLayout(exercises);

  // Assert — the first can group with the next; the last has no next to group with.
  assert.deepEqual(
    layout.map((slot) => slot.canGroupWithNext),
    [true, false],
  );
});
