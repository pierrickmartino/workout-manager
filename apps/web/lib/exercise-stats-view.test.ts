import { test } from "node:test";
import assert from "node:assert/strict";

import { toStatTiles } from "./exercise-stats-view.ts";
import type { ExerciseRecords } from "./exercise-stats-view.ts";

// `toStatTiles` decides which stat-header tiles render and formats them (ADR-0017):
// TOTAL SETS always renders; the PERSONAL RECORD tile renders only when an absolute-
// Load history produced a real Estimated 1RM, and is hidden — never zeroed — otherwise.
// The strength tile is always labelled PERSONAL RECORD, never "personal best". Pure and
// server-free, so it is safe from either a Server or Client Component.

const ABSOLUTE: ExerciseRecords = {
  exercise_id: 1,
  exercise_name: "Back Squat",
  personal_record: 110.0,
  total_sets: 12,
  top_set_series: [],
  pr_milestones: [],
  body_weight_nudge: false,
};

test("renders PERSONAL RECORD and TOTAL SETS for an absolute-load exercise", () => {
  // Arrange / Act
  const tiles = toStatTiles(ABSOLUTE);

  // Assert — both tiles, PR first, formatted in whole kilograms
  assert.deepEqual(tiles, [
    { label: "PERSONAL RECORD", value: "110 kg" },
    { label: "TOTAL SETS", value: "12" },
  ]);
});

test("rounds a fractional Estimated 1RM to whole kilograms", () => {
  // Arrange — Epley estimates are often fractional (90 kg × 5 → 105 kg here)
  const records: ExerciseRecords = { ...ABSOLUTE, personal_record: 105.4 };

  // Act
  const [pr] = toStatTiles(records);

  // Assert — the eye gets whole kilograms, not a long float
  assert.equal(pr.value, "105 kg");
});

test("hides the PERSONAL RECORD tile for a non-absolute exercise with no record", () => {
  // Arrange — a bodyweight movement with no qualifying record (e.g. no captured mass)
  const records: ExerciseRecords = {
    exercise_id: 2,
    exercise_name: "Push-up",
    personal_record: null,
    total_sets: 8,
    top_set_series: [],
    pr_milestones: [],
    body_weight_nudge: false,
  };

  // Act
  const tiles = toStatTiles(records);

  // Assert — TOTAL SETS alone; no zeroed PR tile
  assert.deepEqual(tiles, [{ label: "TOTAL SETS", value: "8" }]);
});

test("shows the PERSONAL RECORD tile for a qualifying bodyweight exercise, as the set", () => {
  // Arrange — a bodyweight Pull-up with a real record (mass captured): the kg headline
  // field stays null, but the newest milestone carries the set that achieved it
  const records: ExerciseRecords = {
    exercise_id: 3,
    exercise_name: "Pull-up",
    personal_record: null,
    total_sets: 20,
    top_set_series: [],
    pr_milestones: [
      {
        exercise: "Pull-up",
        estimated_1rm: 90.0,
        gain: 0,
        date: "2026-02-01",
        reps: 12,
        is_bodyweight: true,
        added_kg: null,
      },
    ],
    body_weight_nudge: false,
  };

  // Act
  const tiles = toStatTiles(records);

  // Assert — the PR tile now renders (no longer hidden), showing the set, never kg
  assert.deepEqual(tiles, [
    { label: "PERSONAL RECORD", value: "bodyweight × 12" },
    { label: "TOTAL SETS", value: "20" },
  ]);
});

test("never labels a tile 'personal best' for the raw heaviest load", () => {
  // Act — over both a with-PR and a without-PR exercise
  const labels = [
    ...toStatTiles(ABSOLUTE),
    ...toStatTiles({ ...ABSOLUTE, personal_record: null }),
  ].map((tile) => tile.label.toLowerCase());

  // Assert — the glossary-banned label never appears
  assert.ok(!labels.some((label) => label.includes("personal best")));
});
