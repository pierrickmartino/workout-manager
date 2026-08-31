import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRecordAchievement } from "./record-achievement.ts";

// `formatRecordAchievement` renders a Personal Record's headline honestly (ADR-0026):
// an absolute record shows its rounded Estimated 1RM in kilograms; a bodyweight record
// shows the *set that achieved it* — reps and any added load — never a kilogram figure,
// which would overstate a low-bodyweight-fraction movement and invite a false
// cross-movement read. Pure and server-free.

test("renders an absolute record as its rounded Estimated 1RM in kilograms", () => {
  // Arrange — a fractional Epley estimate from an absolute set
  const value = formatRecordAchievement(
    {
      estimated_1rm: 105.4,
      reps: 5,
      is_bodyweight: false,
      added_kg: null,
    },
    "kg",
  );

  // Assert — whole kilograms, never a long float
  assert.equal(value, "105 kg");
});

test("renders an absolute record's Estimated 1RM in the reader's pounds", () => {
  // Arrange — the same estimate, read by a lb user
  const value = formatRecordAchievement(
    {
      estimated_1rm: 105.4,
      reps: 5,
      is_bodyweight: false,
      added_kg: null,
    },
    "lb",
  );

  // Assert — 105.4 kg ≈ 232 lb, a whole figure in the reader's unit
  assert.equal(value, "232 lb");
});

test("renders a pure bodyweight record as the set, never kilograms", () => {
  // Arrange — 12 pull-ups scored against a captured mass
  const value = formatRecordAchievement({
    estimated_1rm: 90.0,
    reps: 12,
    is_bodyweight: true,
    added_kg: null,
  }, "kg");

  // Assert — the set that achieved it, with no fabricated kg headline
  assert.equal(value, "bodyweight × 12");
});

test("renders a weighted bodyweight record with its added load", () => {
  // Arrange — bodyweight + 20 kg for 5 reps
  const value = formatRecordAchievement({
    estimated_1rm: 125.0,
    reps: 5,
    is_bodyweight: true,
    added_kg: 20,
  }, "kg");

  // Assert — the added load appears, but the kg-equivalent estimate never does
  assert.equal(value, "bodyweight + 20 kg × 5");
});

test("drops a trailing zero from a fractional added load", () => {
  // Arrange — a half-kilo micro-plate on the belt
  const value = formatRecordAchievement({
    estimated_1rm: 100.0,
    reps: 3,
    is_bodyweight: true,
    added_kg: 2.5,
  }, "kg");

  // Assert — 2.5 stays 2.5; an integer would show without ".0"
  assert.equal(value, "bodyweight + 2.5 kg × 3");
});
