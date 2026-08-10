import { test } from "node:test";
import assert from "node:assert/strict";

import { captureSeedFromRecord } from "./capture-seed.ts";
import type { LoggedSession, LoggedSet } from "./logs-types.ts";
import type { Load } from "./load.ts";
import type { Quantity } from "./quantity.ts";

// `captureSeedFromRecord` folds a plan-less record into the Hand-Authored builder's
// pre-fill (ADR-0044): contiguous same-Exercise runs → one prescription each, sets = run
// length, plan target = the performed range, recommended Load = the run's heaviest set, and
// rest/tempo/supersets left blank (the record never captured them).

function reps(count: number): Quantity {
  return { kind: "repetitions", text: String(count), count };
}

function absolute(kg: number): Load {
  return { kind: "absolute", text: `${kg} kg`, kg };
}

function loggedSet(overrides: Partial<LoggedSet> & Pick<LoggedSet, "position">): LoggedSet {
  return {
    quantity: reps(8),
    load: absolute(60),
    perceived_difficulty: null,
    exercise_id: 1,
    exercise_name: "Back Squat",
    body_weight_kg: null,
    ...overrides,
  };
}

function record(sets: LoggedSet[], trainingType = "strength"): LoggedSession {
  return {
    id: 1,
    clerk_user_id: "u1",
    session_id: null,
    training_type: trainingType,
    performed_on: "2026-06-20",
    completion_outcome: null,
    duration_seconds: null,
    logged_sets: sets,
  };
}

test("carries the record's training type onto the seed", () => {
  // Arrange
  const source = record([loggedSet({ position: 0 })], "cardio");

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert
  assert.equal(seed.trainingType, "cardio");
});

test("folds a same-exercise run into one prescription with sets = run length", () => {
  // Arrange — three squat sets in a row
  const source = record([
    loggedSet({ position: 0 }),
    loggedSet({ position: 1 }),
    loggedSet({ position: 2 }),
  ]);

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert — one exercise, three sets
  assert.equal(seed.exercises.length, 1);
  assert.equal(seed.exercises[0].exerciseId, 1);
  assert.equal(seed.exercises[0].sets, "3");
});

test("seeds the plan target as the performed rep range, collapsing when uniform", () => {
  // Arrange — reps 8, 8, 6
  const source = record([
    loggedSet({ position: 0, quantity: reps(8) }),
    loggedSet({ position: 1, quantity: reps(8) }),
    loggedSet({ position: 2, quantity: reps(6) }),
  ]);

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert — the faithful min–max range
  assert.equal(seed.exercises[0].reps, "6-8");

  // Arrange — a uniform run collapses to a single value
  const uniform = captureSeedFromRecord(
    record([loggedSet({ position: 0, quantity: reps(5) }), loggedSet({ position: 1, quantity: reps(5) })]),
  );
  assert.equal(uniform.exercises[0].reps, "5");
});

test("seeds the recommended load from the run's heaviest performed set", () => {
  // Arrange — 60, 65, 62.5 kg across the run
  const source = record([
    loggedSet({ position: 0, load: absolute(60) }),
    loggedSet({ position: 1, load: absolute(65) }),
    loggedSet({ position: 2, load: absolute(62.5) }),
  ]);

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert — the heaviest, reversed into the picker's fields
  assert.equal(seed.exercises[0].loadKind, "absolute");
  assert.equal(seed.exercises[0].loadValue, "65");
});

test("keeps non-contiguous runs of the same exercise as separate prescriptions", () => {
  // Arrange — A, B, A
  const source = record([
    loggedSet({ position: 0, exercise_id: 1, exercise_name: "Back Squat" }),
    loggedSet({ position: 1, exercise_id: 2, exercise_name: "Bench Press" }),
    loggedSet({ position: 2, exercise_id: 1, exercise_name: "Back Squat" }),
  ]);

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert — three prescriptions, preserving order (never merged)
  assert.equal(seed.exercises.length, 3);
  assert.deepEqual(
    seed.exercises.map((exercise) => exercise.exerciseId),
    [1, 2, 1],
  );
});

test("seeds a distance run's kind, unit, and representative target from its text", () => {
  // Arrange — a 5 km run recorded in miles-free text
  const run: Quantity = { kind: "distance", text: "5 km", metres: 5000 };
  const source = record([
    loggedSet({
      position: 0,
      exercise_id: 3,
      exercise_name: "Run",
      quantity: run,
      load: null,
    }),
  ]);

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert
  assert.equal(seed.exercises[0].kind, "distance");
  assert.equal(seed.exercises[0].unit, "km");
  assert.equal(seed.exercises[0].reps, "5 km");
  // No comparable load on the run → a blank absolute field, never fabricated
  assert.equal(seed.exercises[0].loadKind, "absolute");
  assert.equal(seed.exercises[0].loadValue, "");
});

test("ranks a bodyweight run by its added load", () => {
  // Arrange — dips at +0, +10, +5 kg added
  const bw = (added: number): Load => ({
    kind: "bodyweight",
    text: added === 0 ? "bodyweight" : `bodyweight + ${added} kg`,
    added_kg: added,
  });
  const source = record([
    loggedSet({ position: 0, exercise_id: 4, exercise_name: "Dip", load: bw(0) }),
    loggedSet({ position: 1, exercise_id: 4, exercise_name: "Dip", load: bw(10) }),
    loggedSet({ position: 2, exercise_id: 4, exercise_name: "Dip", load: bw(5) }),
  ]);

  // Act
  const seed = captureSeedFromRecord(source);

  // Assert — the +10 kg set wins
  assert.equal(seed.exercises[0].loadKind, "bodyweight");
  assert.equal(seed.exercises[0].loadValue, "10");
});
