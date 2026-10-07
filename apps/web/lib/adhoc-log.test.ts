import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAdhocLogRequest,
  readAdhocFormRows,
  type AdhocLogFields,
} from "./adhoc-log.ts";
import { setEntryValues } from "./set-entry.ts";

// The ad-hoc path's own rules: the record header (date, Training Type, something performed)
// and which posted rows count (the ones naming a movement). How a row becomes a Logged Set is
// the shared `logged-set` module's policy, tested in `logged-set.test.ts`.

function fields(overrides: Partial<AdhocLogFields> = {}): AdhocLogFields {
  return {
    performedOn: "2026-06-20",
    trainingType: "cardio",
    sets: [{ exerciseId: 7, values: setEntryValues({ reps: "30" }) }],
    ...overrides,
  };
}

test("builds a plan-less request from a picked exercise, type, and rep sets", () => {
  // Act
  const result = buildAdhocLogRequest(fields(), "kg");

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

test("rejects a request with no performed sets", () => {
  // Arrange — every row blank
  const input = fields({ sets: [{ exerciseId: 7, values: setEntryValues({ reps: "" }) }] });

  // Act
  const result = buildAdhocLogRequest(input, "kg");

  // Assert
  assert.deepEqual(result, {
    ok: false,
    error: "Enter an amount for at least one set you performed.",
  });
});

test("rejects a garbled distance instead of dropping the set (ADR-0115)", () => {
  // Arrange — the user typed a distance, but not a number
  const input = fields({
    sets: [{ exerciseId: 7, values: setEntryValues({ kind: "distance", distance: "5,2" }) }],
  });

  // Act
  const result = buildAdhocLogRequest(input, "kg");

  // Assert — an error the user can fix, never a silently shorter record
  assert.equal(result.ok, false);
});

test("rejects a missing performed date", () => {
  const result = buildAdhocLogRequest(fields({ performedOn: "  " }), "kg");
  assert.equal(result.ok, false);
});

test("rejects an unknown training type", () => {
  // The type must be one the domain offers (ADR-0031)
  const result = buildAdhocLogRequest(fields({ trainingType: "powerlifting" }), "kg");
  assert.equal(result.ok, false);
});

test("readAdhocFormRows keeps the rows that name a movement, with their entry values", () => {
  // Arrange
  const form = new FormData();
  form.set("set_count", "3");
  form.set("set-0-movement", "  Running ");
  form.set("set-0-kind", "distance");
  form.set("set-0-distance", "5");
  form.set("set-0-unit", "mi");
  form.set("set-1-movement", "");
  form.set("set-1-reps", "10");
  form.set("set-2-movement", "Plank");
  form.set("set-2-kind", "duration");
  form.set("set-2-duration", "45");

  // Act
  const rows = readAdhocFormRows(form);

  // Assert — the unnamed row was never filled in and is dropped
  assert.equal(rows.length, 2);
  assert.equal(rows[0].movementName, "Running");
  assert.equal(rows[0].values.distance, "5");
  assert.equal(rows[0].values.unit, "mi");
  assert.equal(rows[1].movementName, "Plank");
  assert.equal(rows[1].values.duration, "45");
});
