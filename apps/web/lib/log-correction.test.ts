import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCorrectionRequest,
  buildOutcomeCorrection,
  correctionFieldsFromRecord,
  correctionRowsFromForm,
  correctionSetRow,
  type CorrectionFormFields,
} from "./log-correction.ts";
import { carriedEffortValue } from "./logged-set.ts";
import type { LoggedSession } from "./logs-types";

// Log Correction's own rules: reversing a record into the form, the full-replace header
// (date, Training Type for a plan-less record, at least one set, outcome), which posted rows
// count, and that a record's typed Effort survives the round trip. How each row becomes a
// Logged Set is the shared `logged-set` module's policy, tested in `logged-set.test.ts`.

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

// An RIR-2 set: the backend mirrors it into `perceived_difficulty` as RPE 8.
function rirRecord(): LoggedSession {
  const base = planBackedRecord();
  return {
    ...base,
    logged_sets: [
      { ...base.logged_sets[0], effort: { scale: "rir", value: 2 }, perceived_difficulty: 8 },
    ],
  };
}

function requestFrom(fields: CorrectionFormFields) {
  return buildCorrectionRequest({ ...fields, sets: fields.sets.map(correctionSetRow) }, "kg");
}

test("pre-fills the form from a plan-backed record's current values", () => {
  // Act
  const fields = correctionFieldsFromRecord(planBackedRecord(), "kg");

  // Assert — date, duration, parent Session, and the set round-trip into the form
  assert.equal(fields.performedOn, "2026-06-20");
  assert.equal(fields.sessionId, 7);
  assert.equal(fields.trainingType, "strength");
  assert.equal(fields.durationSeconds, 1200);
  assert.deepEqual(fields.sets, [
    {
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
      carriedEffort: null,
      note: "",
    },
  ]);
});

test("pre-fills a Set Note decoded from its stored escaped form for editing", () => {
  // The stored note is HTML-escaped; the edit field shows the text the user typed, so a
  // re-save re-escapes once rather than double-escaping.
  const base = planBackedRecord();
  const record = {
    ...base,
    logged_sets: [{ ...base.logged_sets[0], note: "a &amp; b" }],
  };

  const fields = correctionFieldsFromRecord(record, "kg");

  assert.equal(fields.sets[0].note, "a & b");
});

test("pre-fills a typed Effort as carried, seeded with the RPE the cell shows", () => {
  const [set] = correctionFieldsFromRecord(rirRecord(), "kg").sets;
  assert.equal(set.perceivedDifficulty, 8);
  assert.deepEqual(set.carriedEffort, { effort: { scale: "rir", value: 2 }, shownAs: "8" });
});

test("an unedited save re-sends the record's contents, its RPE now typed", () => {
  // Act
  const result = requestFrom(correctionFieldsFromRecord(planBackedRecord(), "kg"));

  // Assert — the record's contents, with the RPE sent as a typed Effort (ADR-0066)
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
        effort_scale: "rpe",
        effort_value: 8,
      },
    ],
  });
});

test("an unedited save keeps an RIR Effort as RIR (ADR-0115)", () => {
  const result = requestFrom(correctionFieldsFromRecord(rirRecord(), "kg"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets[0].effort_scale, "rir");
  assert.equal(result.request.logged_sets[0].effort_value, 2);
});

test("an outcome flip keeps an RIR Effort as RIR", () => {
  const result = buildOutcomeCorrection(rirRecord(), "incomplete");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets[0].effort_scale, "rir");
  assert.equal(result.request.logged_sets[0].effort_value, 2);
});

test("a plan-less record round-trips its distance and sends its training type", () => {
  // Arrange — an ad-hoc, standalone record (ADR-0031): session_id is null
  const record = planBackedRecord({
    session_id: null,
    training_type: "cardio",
    completion_outcome: null,
    logged_sets: [
      {
        position: 0,
        quantity: { kind: "distance", text: "5 km", metres: 5000, duration_s: 1500 },
        load: { kind: "bodyweight", text: "bodyweight" },
        perceived_difficulty: null,
        exercise_id: 9,
        exercise_name: "Running",
        body_weight_kg: null,
      },
    ],
  });

  // Act
  const fields = correctionFieldsFromRecord(record, "kg");
  const result = requestFrom(fields);

  // Assert — metres → km + pace time, and the type is sent
  assert.equal(fields.sets[0].distance, "5");
  assert.equal(fields.sets[0].duration, "25:00");
  assert.equal(fields.sets[0].loadKind, "bodyweight");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.training_type, "cardio");
  assert.equal(result.request.logged_sets[0].quantity_value, "5");
  assert.equal(result.request.logged_sets[0].quantity_duration, "25:00");
});

test("a plan-backed correction never sends a training type", () => {
  const result = requestFrom(correctionFieldsFromRecord(planBackedRecord(), "kg"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("training_type" in result.request, false);
});

test("rejects a plan-less correction with an unknown training type", () => {
  const fields = correctionFieldsFromRecord(planBackedRecord({ session_id: null }), "kg");
  const result = requestFrom({ ...fields, trainingType: "not-a-type" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /training type/i);
});

test("rejects a correction that would leave zero sets", () => {
  // Arrange — the only row has its amount cleared, so it is dropped
  const fields = correctionFieldsFromRecord(planBackedRecord(), "kg");
  const cleared = { ...fields, sets: [{ ...fields.sets[0], reps: "   " }] };

  // Act
  const result = requestFrom(cleared);

  // Assert — a record always keeps at least one set
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /at least one set/i);
});

test("an edit correction never sends a Completion Outcome (the server preserves it)", () => {
  const result = requestFrom(correctionFieldsFromRecord(planBackedRecord(), "kg"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("completion_outcome" in result.request, false);
});

test("an outcome correction carries the flipped outcome and the record's contents", () => {
  // Act
  const result = buildOutcomeCorrection(planBackedRecord(), "incomplete");

  // Assert — a plan-backed correction still omits the training type (derived server-side)
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.completion_outcome, "incomplete");
  assert.equal(result.request.performed_on, "2026-06-20");
  assert.equal(result.request.logged_sets[0].exercise_id, 3);
  assert.equal(result.request.logged_sets[0].load_value, "60");
  assert.equal("training_type" in result.request, false);
});

// --- Which posted rows count.

test("correctionRowsFromForm reads existing sets, added movements, and carried Efforts", () => {
  // Arrange — an existing set with a carried RIR, an added plank, and an added row left blank
  const form = new FormData();
  form.set("set_count", "3");
  form.set("set-0-exercise_id", "3");
  form.set("set-0-reps", "5");
  form.set("set-0-rpe", "8");
  form.set(
    "set-0-carried_effort",
    carriedEffortValue({ effort: { scale: "rir", value: 2 }, shownAs: "8" }),
  );
  form.set("set-1-movement", "Plank");
  form.set("set-1-kind", "duration");
  form.set("set-1-duration", "1:30");
  form.set("set-2-movement", "Bicep Curl");
  form.set("set-2-reps", " ");

  // Act
  const rows = correctionRowsFromForm(form);

  // Assert — the blank added row is dropped before its movement could be resolved
  assert.equal(rows.length, 2);
  const [existing, added] = rows;
  assert.equal(existing.added, false);
  if (existing.added) return;
  assert.equal(existing.row.exerciseId, 3);
  assert.deepEqual(existing.row.carriedEffort?.effort, { scale: "rir", value: 2 });
  assert.equal(added.added, true);
  if (!added.added) return;
  assert.equal(added.movementName, "Plank");
  assert.equal(added.values.duration, "1:30");
});
