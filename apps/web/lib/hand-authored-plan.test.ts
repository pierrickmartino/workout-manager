import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthorPlanRequest,
  type AuthoredExerciseFields,
} from "./hand-authored-session.ts";

// `buildAuthorPlanRequest` is the plan-only sibling of `buildAuthorSessionRequest` (Capture,
// ADR-0044): it validates and maps *only* the plan half — no date, no performed sets, no
// "log at least one set" rule — into the `/api/sessions/plan` payload.

function exercise(
  overrides: Partial<AuthoredExerciseFields> = {},
): AuthoredExerciseFields {
  return {
    exerciseId: 1,
    kind: "repetitions",
    unit: "km",
    sets: "3",
    reps: "8-10",
    restSeconds: "",
    tempo: "",
    loadKind: "absolute",
    loadValue: "60",
    supersetGroup: null,
    roundRestSeconds: null,
    performedSets: [],
    ...overrides,
  };
}

test("maps the plan to the payload, ignoring performed sets entirely", () => {
  // Arrange — a plan with performed sets present (they must be dropped)
  const fields = {
    trainingType: "strength",
    exercises: [exercise({ performedSets: [{ reps: "8", loadValue: "60" }] })],
  };

  // Act
  const result = buildAuthorPlanRequest(fields, "kg");

  // Assert — only prescriptions; no logged_sets field exists on the plan-only payload
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.training_type, "strength");
  assert.equal(result.request.prescriptions.length, 1);
  assert.deepEqual(Object.keys(result.request).sort(), ["prescriptions", "training_type"]);
  const prescription = result.request.prescriptions[0];
  assert.equal(prescription.sets, 3);
  assert.equal(prescription.reps, "8-10");
  assert.equal(prescription.load_kind, "absolute");
  assert.equal(prescription.load_value, "60");
});

test("carries the picked Quantity kind and unit onto the captured plan", () => {
  // Arrange — Capture folds a distance record into a distance-kind exercise; the pick must
  // ride onto the plan-only payload (#345) so the reusable plan stays a running plan.
  const fields = {
    trainingType: "cardio",
    exercises: [exercise({ kind: "distance", unit: "mi", reps: "5 mi", loadKind: "bodyweight" })],
  };

  // Act
  const result = buildAuthorPlanRequest(fields, "kg");

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const prescription = result.request.prescriptions[0];
  assert.equal(prescription.quantity_kind, "distance");
  assert.equal(prescription.quantity_unit, "mi");
});

test("rejects an unknown training type", () => {
  const result = buildAuthorPlanRequest({
    trainingType: "not-a-type",
    exercises: [exercise()],
  }, "kg");
  assert.deepEqual(result, { ok: false, error: "Pick a training type." });
});

test("rejects a plan with no exercises", () => {
  const result = buildAuthorPlanRequest({ trainingType: "strength", exercises: [] }, "kg");
  assert.deepEqual(result, { ok: false, error: "Add at least one exercise." });
});

test("rejects an exercise missing its target, worded for the amount kind", () => {
  const result = buildAuthorPlanRequest({
    trainingType: "strength",
    exercises: [exercise({ reps: "" })],
  }, "kg");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /rep target/);
});

test("rejects an exercise with no sets", () => {
  const result = buildAuthorPlanRequest({
    trainingType: "strength",
    exercises: [exercise({ sets: "0" })],
  }, "kg");
  assert.deepEqual(result, {
    ok: false,
    error: "Each exercise needs at least one set.",
  });
});
