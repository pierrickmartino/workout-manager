import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAdhocLogRequest, type AdhocLogFields } from "./adhoc-log.ts";

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
