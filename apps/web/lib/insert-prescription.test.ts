import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInsertPrescriptionRequest,
  type InsertPrescriptionFields,
} from "./insert-prescription.ts";

// `buildInsertPrescriptionRequest` is the single-prescription sibling of the Hand-Authored
// session view-model (Insert, ADR-0051, issue #360): it validates and maps one "Add exercise"
// editor's fields into the `POST /api/sessions/{id}/prescriptions` payload — no date, no
// performed sets, and always solo (non-Superset in v1).

function fields(
  overrides: Partial<InsertPrescriptionFields> = {},
): InsertPrescriptionFields {
  return {
    exerciseId: 7,
    kind: "repetitions",
    unit: "km",
    sets: "3",
    reps: "8-12",
    restSeconds: "90",
    tempo: "3-1-1",
    loadKind: "absolute",
    loadValue: "60",
    ...overrides,
  };
}

test("maps a complete prescription to the Insert payload", () => {
  // Act
  const result = buildInsertPrescriptionRequest(fields());

  // Assert — every plan field carried, the Superset overlay nulled (solo in v1)
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    exercise_id: 7,
    sets: 3,
    reps: "8-12",
    rest_seconds: 90,
    tempo: "3-1-1",
    load_kind: "absolute",
    load_value: "60",
    quantity_kind: "repetitions",
    quantity_unit: "km",
    superset_group: null,
    round_rest_seconds: null,
  });
});

test("carries the picked Quantity kind and unit onto the plan", () => {
  // Arrange — a distance movement authored in miles (#345): the pick must ride onto the payload
  // so the appended prescription stays a running prescription when the Session is reused/logged.
  const result = buildInsertPrescriptionRequest(
    fields({ kind: "distance", unit: "mi", reps: "5 mi", loadKind: "", loadValue: "" }),
  );

  // Assert
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.quantity_kind, "distance");
  assert.equal(result.request.quantity_unit, "mi");
  // A blank Load kind falls back to the Amount kind's default (bodyweight for a run).
  assert.equal(result.request.load_kind, "bodyweight");
  assert.equal(result.request.load_value, null);
});

test("nulls optional rest, tempo, and load when left blank", () => {
  const result = buildInsertPrescriptionRequest(
    fields({ restSeconds: "", tempo: "", loadValue: "  " }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.rest_seconds, null);
  assert.equal(result.request.tempo, null);
  assert.equal(result.request.load_value, null);
});

test("rejects the add before an exercise is picked, sending nothing", () => {
  const result = buildInsertPrescriptionRequest(fields({ exerciseId: null }));
  assert.deepEqual(result, { ok: false, error: "Pick an exercise to add." });
});

test("rejects a non-integer exercise id", () => {
  const result = buildInsertPrescriptionRequest(fields({ exerciseId: 1.5 }));
  assert.deepEqual(result, { ok: false, error: "Pick an exercise to add." });
});

test("rejects a prescription with no sets", () => {
  const result = buildInsertPrescriptionRequest(fields({ sets: "0" }));
  assert.deepEqual(result, { ok: false, error: "Add at least one set." });
});

test("rejects a prescription with a non-numeric sets count", () => {
  const result = buildInsertPrescriptionRequest(fields({ sets: "lots" }));
  assert.deepEqual(result, { ok: false, error: "Add at least one set." });
});

test("rejects a missing target, worded for the reps kind", () => {
  const result = buildInsertPrescriptionRequest(fields({ reps: "   " }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /rep target/);
});

test("rejects a missing target, worded for the duration kind", () => {
  const result = buildInsertPrescriptionRequest(fields({ kind: "duration", reps: "" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /hold time/);
});

test("rejects a missing target, worded for the distance kind", () => {
  const result = buildInsertPrescriptionRequest(fields({ kind: "distance", reps: "" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /distance/);
});
