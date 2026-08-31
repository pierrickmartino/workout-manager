import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCorrectionRequest,
  buildOutcomeCorrection,
  correctionFieldsFromRecord,
  type CorrectionFormFields,
} from "./log-correction.ts";
import type { LoggedSession } from "./logs-types";

function planBackedRecord(
  overrides: Partial<LoggedSession> = {},
): LoggedSession {
  return {
    id: 42,
    clerk_user_id: "user_owner",
    session_id: 7,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: "completed",
    duration_seconds: 1200,
    logged_sets: [
      {
        position: 0,
        quantity: { kind: "repetitions", text: "5", count: 5 },
        load: { kind: "absolute", text: "60 kg", kg: 60 },
        perceived_difficulty: 8,
        exercise_id: 3,
        exercise_name: "Back Squat",
        body_weight_kg: null,
      },
    ],
    ...overrides,
  };
}

test("pre-fills the form from a plan-backed record's current values", () => {
  // Arrange
  const record = planBackedRecord();

  // Act
  const fields = correctionFieldsFromRecord(record, "kg");

  // Assert — date, duration, parent Session, and the set round-trip into the form
  assert.equal(fields.performedOn, "2026-06-20");
  assert.equal(fields.sessionId, 7);
  assert.equal(fields.trainingType, "strength");
  assert.equal(fields.durationSeconds, 1200);
  assert.equal(fields.sets.length, 1);
  assert.deepEqual(fields.sets[0], {
    exerciseId: 3,
    exerciseName: "Back Squat",
    kind: "repetitions",
    reps: "5",
    distance: "",
    unit: "km",
    duration: "",
    loadKind: "absolute",
    loadValue: "60",
    perceivedDifficulty: 8,
  });
});

test("builds a PUT payload from edited plan-backed fields, omitting training type", () => {
  // Arrange — the user corrected the load to 70 kg and the reps to 6
  const fields: CorrectionFormFields = {
    performedOn: "2026-07-01",
    sessionId: 7,
    trainingType: "strength",
    durationSeconds: 1500,
    sets: [
      {
        exerciseId: 3,
        exerciseName: "Back Squat",
        kind: "repetitions",
        reps: "6",
        distance: "",
        unit: "km",
        duration: "",
        loadKind: "absolute",
        loadValue: "70",
        perceivedDifficulty: 7,
      },
    ],
  };

  // Act
  const result = buildCorrectionRequest(fields, "kg");

  // Assert — a plan-backed correction never sends a training type (server derives it)
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    performed_on: "2026-07-01",
    duration_seconds: 1500,
    logged_sets: [
      {
        exercise_id: 3,
        quantity_kind: "repetitions",
        quantity_value: "6",
        load_kind: "absolute",
        load_value: "70",
        perceived_difficulty: 7,
      },
    ],
  });
  assert.equal("training_type" in result.request, false);
});

test("pre-fills and requires a training type for a plan-less record", () => {
  // Arrange — an ad-hoc, standalone record (ADR-0031): session_id is null
  const record = planBackedRecord({
    session_id: null,
    training_type: "cardio",
    completion_outcome: null,
    logged_sets: [
      {
        position: 0,
        quantity: {
          kind: "distance",
          text: "5 km",
          metres: 5000,
          duration_s: 1500,
        },
        load: { kind: "bodyweight", text: "bodyweight" },
        perceived_difficulty: null,
        exercise_id: 9,
        exercise_name: "Running",
        body_weight_kg: null,
      },
    ],
  });

  // Act — pre-fill, then build unchanged
  const fields = correctionFieldsFromRecord(record, "kg");
  const result = buildCorrectionRequest(fields, "kg");

  // Assert — the distance round-trips (metres → km + pace time) and the type is sent
  assert.equal(fields.sessionId, null);
  assert.equal(fields.sets[0].kind, "distance");
  assert.equal(fields.sets[0].distance, "5");
  assert.equal(fields.sets[0].unit, "km");
  assert.equal(fields.sets[0].duration, "25:00");
  assert.equal(fields.sets[0].loadKind, "bodyweight");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.training_type, "cardio");
  assert.equal(result.request.logged_sets[0].quantity_kind, "distance");
  assert.equal(result.request.logged_sets[0].quantity_value, "5");
  assert.equal(result.request.logged_sets[0].quantity_duration, "25:00");
});

test("rejects a plan-less correction with an unknown training type", () => {
  // Arrange
  const fields: CorrectionFormFields = {
    performedOn: "2026-07-01",
    sessionId: null,
    trainingType: "not-a-type",
    durationSeconds: null,
    sets: [
      {
        exerciseId: 9,
        exerciseName: "Running",
        kind: "repetitions",
        reps: "30",
        distance: "",
        unit: "km",
        duration: "",
        loadKind: "bodyweight",
        loadValue: "",
        perceivedDifficulty: null,
      },
    ],
  };

  // Act
  const result = buildCorrectionRequest(fields, "kg");

  // Assert
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /training type/i);
});

test("rejects a correction that would leave zero sets", () => {
  // Arrange — the only row has its amount cleared, so it is dropped
  const fields: CorrectionFormFields = {
    performedOn: "2026-07-01",
    sessionId: 7,
    trainingType: "strength",
    durationSeconds: null,
    sets: [
      {
        exerciseId: 3,
        exerciseName: "Back Squat",
        kind: "repetitions",
        reps: "   ",
        distance: "",
        unit: "km",
        duration: "",
        loadKind: "absolute",
        loadValue: "70",
        perceivedDifficulty: null,
      },
    ],
  };

  // Act
  const result = buildCorrectionRequest(fields, "kg");

  // Assert — a session always keeps at least one set
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /at least one set/i);
});

test("an edit correction never sends a Completion Outcome (the server preserves it)", () => {
  // Arrange — a plan-backed record pre-filled straight into the build step
  const record = planBackedRecord();

  // Act — build the correction from the record's unchanged fields
  const result = buildCorrectionRequest(correctionFieldsFromRecord(record, "kg"), "kg");

  // Assert — the payload omits completion_outcome, so the server keeps the record's
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("completion_outcome" in result.request, false);
});

test("builds an outcome correction that carries the flipped outcome and the record's contents", () => {
  // Arrange — a plan-backed Completed record to un-complete
  const record = planBackedRecord({ completion_outcome: "completed" });

  // Act — flip its outcome to Incomplete, preserving its sets and date
  const result = buildOutcomeCorrection(record, "incomplete");

  // Assert — the PUT carries the new outcome plus the record's unchanged contents; a
  // plan-backed correction still omits the training type (derived server-side)
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.completion_outcome, "incomplete");
  assert.equal(result.request.performed_on, "2026-06-20");
  assert.equal(result.request.logged_sets.length, 1);
  assert.equal(result.request.logged_sets[0].exercise_id, 3);
  assert.equal("training_type" in result.request, false);
});

test("builds an outcome correction for the fill direction (Incomplete to Completed)", () => {
  // Arrange — a plan-backed Incomplete record to mark Completed
  const record = planBackedRecord({ completion_outcome: "incomplete" });

  // Act
  const result = buildOutcomeCorrection(record, "completed");

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.completion_outcome, "completed");
});

// --- Add a movement (record side, issue #358) --------------------------------------

test("an appended set row round-trips into the correction payload", () => {
  // Arrange — the record's own set, plus a freshly added row (its movement already
  // resolved to a catalog Exercise id by the action, like the ad-hoc log flow)
  const fields: CorrectionFormFields = {
    ...correctionFieldsFromRecord(planBackedRecord(), "kg"),
    sets: [
      ...correctionFieldsFromRecord(planBackedRecord(), "kg").sets,
      {
        exerciseId: 11,
        exerciseName: "Plank",
        kind: "duration",
        reps: "",
        distance: "",
        unit: "km",
        duration: "1:30",
        loadKind: "bodyweight",
        loadValue: "",
        perceivedDifficulty: 6,
      },
    ],
  };

  // Act
  const result = buildCorrectionRequest(fields, "kg");

  // Assert — the full-replace payload carries both the original and the appended set
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 2);
  assert.deepEqual(result.request.logged_sets[1], {
    exercise_id: 11,
    quantity_kind: "duration",
    quantity_value: "1:30",
    load_kind: "bodyweight",
    load_value: null,
    perceived_difficulty: 6,
  });
});

test("an appended off-plan movement on a plan-backed record builds a valid request", () => {
  // Arrange — a plan-backed (session_id) record; the added set names a movement the
  // plan never prescribed (a different Exercise id than the record's own set)
  const fields: CorrectionFormFields = {
    ...correctionFieldsFromRecord(planBackedRecord(), "kg"),
    sets: [
      ...correctionFieldsFromRecord(planBackedRecord(), "kg").sets,
      {
        exerciseId: 21,
        exerciseName: "Bicep Curl",
        kind: "repetitions",
        reps: "12",
        distance: "",
        unit: "km",
        duration: "",
        loadKind: "absolute",
        loadValue: "15",
        perceivedDifficulty: null,
      },
    ],
  };

  // Act
  const result = buildCorrectionRequest(fields, "kg");

  // Assert — the off-plan set persists as an ordinary set; a plan-backed correction
  // still omits the training type (the server derives it from the Session)
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 2);
  assert.equal(result.request.logged_sets[1].exercise_id, 21);
  assert.equal(result.request.logged_sets[1].quantity_value, "12");
  assert.equal("training_type" in result.request, false);
});

test("a save with no additions reproduces the record's existing payload byte-for-byte", () => {
  // Arrange — pre-fill straight from the record, adding nothing
  const record = planBackedRecord();

  // Act
  const result = buildCorrectionRequest(correctionFieldsFromRecord(record, "kg"), "kg");

  // Assert — the payload is exactly the record's contents, with no new fields
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    performed_on: "2026-06-20",
    duration_seconds: 1200,
    logged_sets: [
      {
        exercise_id: 3,
        quantity_kind: "repetitions",
        quantity_value: "5",
        load_kind: "absolute",
        load_value: "60",
        perceived_difficulty: 8,
      },
    ],
  });
});

test("a blank appended row is dropped (matches the cleared-row behavior)", () => {
  // Arrange — the record's own set plus an added row left un-performed (no amount)
  const fields: CorrectionFormFields = {
    ...correctionFieldsFromRecord(planBackedRecord(), "kg"),
    sets: [
      ...correctionFieldsFromRecord(planBackedRecord(), "kg").sets,
      {
        exerciseId: 11,
        exerciseName: "Plank",
        kind: "repetitions",
        reps: "   ",
        distance: "",
        unit: "km",
        duration: "",
        loadKind: "absolute",
        loadValue: "",
        perceivedDifficulty: null,
      },
    ],
  };

  // Act
  const result = buildCorrectionRequest(fields, "kg");

  // Assert — the empty appended row never reaches the payload; the record's set remains
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 1);
  assert.equal(result.request.logged_sets[0].exercise_id, 3);
});
