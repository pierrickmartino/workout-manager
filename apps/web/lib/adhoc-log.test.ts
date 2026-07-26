import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAdhocLogRequest,
  readAdhocFormRows,
  type AdhocLogFields,
} from "./adhoc-log.ts";

function fields(overrides: Partial<AdhocLogFields> = {}): AdhocLogFields {
  return {
    performedOn: "2026-06-20",
    trainingType: "cardio",
    sets: [{ exerciseId: 7, reps: "30" }],
    ...overrides,
  };
}

test("builds a plan-less request from a picked exercise, type, and rep sets", () => {
  // Arrange
  const input = fields();

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — a well-formed LogAdhocInput carrying a repetitions Quantity, no outcome
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    performed_on: "2026-06-20",
    training_type: "cardio",
    logged_sets: [
      {
        exercise_id: 7,
        quantity_kind: "repetitions",
        quantity_value: "30",
        load_kind: "absolute",
        load_value: null,
        perceived_difficulty: null,
      },
    ],
  });
});

test("carries the picked load kind and value through when given", () => {
  // Arrange — a weighted movement logged with an absolute load
  const input = fields({
    sets: [{ exerciseId: 3, reps: "5", loadKind: "absolute", loadValue: "70" }],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets[0].load_kind, "absolute");
  assert.equal(result.request.logged_sets[0].load_value, "70");
});

test("skips rows left without reps and keeps the ones performed", () => {
  // Arrange — two rows, one blank (a movement the user didn't do)
  const input = fields({
    sets: [
      { exerciseId: 7, reps: "30" },
      { exerciseId: 9, reps: "" },
    ],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — only the performed row survives
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 1);
  assert.equal(result.request.logged_sets[0].exercise_id, 7);
});

test("rejects a request with no performed sets", () => {
  // Arrange — every row blank
  const input = fields({ sets: [{ exerciseId: 7, reps: "" }] });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert
  assert.equal(result.ok, false);
});

test("rejects a missing performed date", () => {
  // Act / Assert
  const result = buildAdhocLogRequest(fields({ performedOn: "  " }));
  assert.equal(result.ok, false);
});

test("rejects an unknown training type", () => {
  // Act / Assert — the type must be one the domain offers (ADR-0031)
  const result = buildAdhocLogRequest(fields({ trainingType: "powerlifting" }));
  assert.equal(result.ok, false);
});

test("rejects a negative or non-integer rep count", () => {
  // Act / Assert — a rep count is a whole, non-negative number
  assert.equal(buildAdhocLogRequest(fields({ sets: [{ exerciseId: 7, reps: "-3" }] })).ok, false);
  assert.equal(buildAdhocLogRequest(fields({ sets: [{ exerciseId: 7, reps: "3.5" }] })).ok, false);
});

test("readAdhocFormRows reads each indexed row's movement, kind, and fields", () => {
  // Arrange — a two-row form: a timed run and a weighted set of squats
  const form = new FormData();
  form.set("set_count", "2");
  form.set("set-0-movement", "Running");
  form.set("set-0-kind", "distance");
  form.set("set-0-distance", "10");
  form.set("set-0-unit", "km");
  form.set("set-0-duration", "52:00");
  form.set("set-1-movement", "Back Squat");
  form.set("set-1-kind", "repetitions");
  form.set("set-1-reps", "5");
  form.set("set-1-load_kind", "absolute");
  form.set("set-1-load_value", "100");

  // Act
  const rows = readAdhocFormRows(form);

  // Assert — both rows surface with their movement name and typed fields
  assert.equal(rows.length, 2);
  assert.equal(rows[0].movementName, "Running");
  assert.equal(rows[0].fields.kind, "distance");
  assert.equal(rows[0].fields.distance, "10");
  assert.equal(rows[0].fields.duration, "52:00");
  assert.equal(rows[1].movementName, "Back Squat");
  assert.equal(rows[1].fields.kind, "repetitions");
  assert.equal(rows[1].fields.reps, "5");
  assert.equal(rows[1].fields.loadValue, "100");
});

test("readAdhocFormRows skips rows with no movement named", () => {
  // Arrange — a form whose second row was never filled in
  const form = new FormData();
  form.set("set_count", "2");
  form.set("set-0-movement", "Running");
  form.set("set-0-kind", "distance");
  form.set("set-0-distance", "5");
  form.set("set-1-movement", "   ");

  // Act
  const rows = readAdhocFormRows(form);

  // Assert — only the named row is returned
  assert.equal(rows.length, 1);
  assert.equal(rows[0].movementName, "Running");
});

test("builds a distance set carrying its unit and companion time", () => {
  // Arrange — a 10 km run in 52:00 logged as a distance set
  const input = fields({
    sets: [
      {
        exerciseId: 7,
        kind: "distance",
        distance: "10",
        unit: "km",
        duration: "52:00",
        loadKind: "qualitative",
      },
    ],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — the picked kind is authoritative; unit and time ride through verbatim
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request.logged_sets[0], {
    exercise_id: 7,
    quantity_kind: "distance",
    quantity_value: "10",
    quantity_unit: "km",
    quantity_duration: "52:00",
    load_kind: "qualitative",
    load_value: null,
    perceived_difficulty: null,
  });
});

test("a distance set entered in miles carries the miles unit through", () => {
  // Arrange — a 3 mile run; the unit rides through for the backend to canonicalise
  const input = fields({
    sets: [{ exerciseId: 7, kind: "distance", distance: "3", unit: "mi" }],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets[0].quantity_unit, "mi");
  assert.equal(result.request.logged_sets[0].quantity_duration, null);
});

test("builds a mixed session with heterogeneous distance and rep sets", () => {
  // Arrange — a run then some squats: one request, two kinds
  const input = fields({
    trainingType: "strength",
    sets: [
      { exerciseId: 7, kind: "distance", distance: "5", unit: "km" },
      { exerciseId: 9, kind: "repetitions", reps: "5", loadKind: "absolute", loadValue: "100" },
    ],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — both survive, each typed by its own picked kind
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 2);
  assert.equal(result.request.logged_sets[0].quantity_kind, "distance");
  assert.equal(result.request.logged_sets[1].quantity_kind, "repetitions");
  assert.equal(result.request.logged_sets[1].quantity_value, "5");
});

test("skips a distance row left without a distance value", () => {
  // Arrange — a distance row the user didn't fill, alongside one they did
  const input = fields({
    sets: [
      { exerciseId: 7, kind: "distance", distance: "" },
      { exerciseId: 9, kind: "distance", distance: "5", unit: "km" },
    ],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — only the performed distance row survives
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 1);
  assert.equal(result.request.logged_sets[0].exercise_id, 9);
});

test("builds a duration set from a mm:ss hold", () => {
  // Arrange — a 5-minute plank logged as a plan-less duration set (no distance)
  const input = fields({
    trainingType: "mobility",
    sets: [{ exerciseId: 7, kind: "duration", duration: "5:00", loadKind: "bodyweight" }],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — the picked kind is authoritative; the time rides through verbatim, with
  // no distance unit and no companion time (a duration carries no pace)
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request.logged_sets[0], {
    exercise_id: 7,
    quantity_kind: "duration",
    quantity_value: "5:00",
    load_kind: "bodyweight",
    load_value: null,
    perceived_difficulty: null,
  });
});

test("builds a duration set from a bare-seconds plank", () => {
  // Arrange — a 90-second plank entered as a raw seconds count
  const input = fields({
    sets: [{ exerciseId: 7, kind: "duration", duration: "90" }],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — a bare-seconds value is a valid duration and rides through unchanged
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets[0].quantity_kind, "duration");
  assert.equal(result.request.logged_sets[0].quantity_value, "90");
});

test("builds a distance-unknown treadmill session as a duration set", () => {
  // Arrange — 45 minutes of zone-2 on a treadmill, distance unknown: time is the amount
  const input = fields({
    sets: [{ exerciseId: 7, kind: "duration", duration: "45:00" }],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — no distance is required; the session records purely as a duration
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 1);
  assert.equal(result.request.logged_sets[0].quantity_kind, "duration");
  assert.equal(result.request.logged_sets[0].quantity_value, "45:00");
});

test("skips a duration row left without a time and keeps a performed one", () => {
  // Arrange — a duration row the user didn't fill, alongside one they did
  const input = fields({
    sets: [
      { exerciseId: 7, kind: "duration", duration: "" },
      { exerciseId: 9, kind: "duration", duration: "90" },
    ],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — only the performed duration row survives
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 1);
  assert.equal(result.request.logged_sets[0].exercise_id, 9);
});

test("rejects a non-positive or non-numeric duration", () => {
  // Act / Assert — a duration is a positive time; zero and garbage are malformed
  assert.equal(
    buildAdhocLogRequest(
      fields({ sets: [{ exerciseId: 7, kind: "duration", duration: "0" }] }),
    ).ok,
    false,
  );
  assert.equal(
    buildAdhocLogRequest(
      fields({ sets: [{ exerciseId: 7, kind: "duration", duration: "a while" }] }),
    ).ok,
    false,
  );
  assert.equal(
    buildAdhocLogRequest(
      fields({ sets: [{ exerciseId: 7, kind: "duration", duration: "1:aa" }] }),
    ).ok,
    false,
  );
});

test("builds a heterogeneous session mixing a hold, a run, and a rep set", () => {
  // Arrange — one plan-less record carrying all three Quantity kinds
  const input = fields({
    trainingType: "strength",
    sets: [
      { exerciseId: 5, kind: "duration", duration: "1:30", loadKind: "bodyweight" },
      { exerciseId: 7, kind: "distance", distance: "5", unit: "km" },
      { exerciseId: 9, kind: "repetitions", reps: "5", loadKind: "absolute", loadValue: "100" },
    ],
  });

  // Act
  const result = buildAdhocLogRequest(input);

  // Assert — all three survive, each typed by its own picked kind
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.logged_sets.length, 3);
  assert.equal(result.request.logged_sets[0].quantity_kind, "duration");
  assert.equal(result.request.logged_sets[1].quantity_kind, "distance");
  assert.equal(result.request.logged_sets[2].quantity_kind, "repetitions");
});

test("readAdhocFormRows reads a duration row's kind and time", () => {
  // Arrange — a form with one duration row: a 5-minute hold
  const form = new FormData();
  form.set("set_count", "1");
  form.set("set-0-movement", "Plank");
  form.set("set-0-kind", "duration");
  form.set("set-0-duration", "5:00");
  form.set("set-0-load_kind", "bodyweight");

  // Act
  const rows = readAdhocFormRows(form);

  // Assert — the duration kind and its time surface for the mapper
  assert.equal(rows.length, 1);
  assert.equal(rows[0].movementName, "Plank");
  assert.equal(rows[0].fields.kind, "duration");
  assert.equal(rows[0].fields.duration, "5:00");
});

test("rejects a non-positive or non-numeric distance", () => {
  // Act / Assert — a distance is a positive number
  assert.equal(
    buildAdhocLogRequest(
      fields({ sets: [{ exerciseId: 7, kind: "distance", distance: "0" }] }),
    ).ok,
    false,
  );
  assert.equal(
    buildAdhocLogRequest(
      fields({ sets: [{ exerciseId: 7, kind: "distance", distance: "far" }] }),
    ).ok,
    false,
  );
});
