import { test } from "node:test";
import assert from "node:assert/strict";

import { toStrengthTrajectories } from "./strength-trajectories-view.ts";
import type { ExerciseTrajectory } from "./strength-analytics-types.ts";

// `toStrengthTrajectories` shapes the ranked strength small-multiples (issue #177): one
// tile per qualifying Exercise, each carrying a link to its canonical Exercise Detail
// chart and the same Top-Set trend rows/delta the full chart uses (via `toTopSetTrend`).
// Pure and server-free.

const SQUAT: ExerciseTrajectory = {
  exercise_id: 7,
  exercise: "Back Squat",
  series: [
    { date: "2026-06-01", estimated_1rm: 100 },
    { date: "2026-07-04", estimated_1rm: 110 },
  ],
};

test("maps each trajectory to a tile linking to its Exercise Detail chart", () => {
  // Act
  const tiles = toStrengthTrajectories([SQUAT]);

  // Assert — the tile carries the Exercise, a deep link, and the charted trend
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].exerciseId, 7);
  assert.equal(tiles[0].exercise, "Back Squat");
  assert.equal(tiles[0].href, "/exercises/7");
});

test("surfaces the latest top set as a whole-kilogram headline estimate", () => {
  // Arrange — a fractional Epley estimate must round for the eye
  const fractional: ExerciseTrajectory = {
    exercise_id: 9,
    exercise: "Bench Press",
    series: [{ date: "2026-07-01", estimated_1rm: 104.166 }],
  };

  // Act
  const [tile] = toStrengthTrajectories([fractional]);

  // Assert — the most recent session's top set, rounded, in kg
  assert.equal(tile.estimate, "104 kg");
});

test("builds a screen-reader label naming the lift, its latest top set, and trend", () => {
  // Act
  const [tile] = toStrengthTrajectories([SQUAT]);

  // Assert — the label carries what the decorative chart cannot convey aurally
  assert.equal(
    tile.ariaLabel,
    "Back Squat: latest top set 110 kg, +10 KG over recent sessions. View full chart.",
  );
});

test("omits the trend clause from the label when there is only one session", () => {
  // Arrange — a single point has no delta to describe
  const press: ExerciseTrajectory = {
    exercise_id: 3,
    exercise: "Overhead Press",
    series: [{ date: "2026-07-01", estimated_1rm: 60 }],
  };

  // Act
  const [tile] = toStrengthTrajectories([press]);

  // Assert
  assert.equal(
    tile.ariaLabel,
    "Overhead Press: latest top set 60 kg. View full chart.",
  );
});

test("reuses the Top-Set trend shaping for each tile's rows and delta", () => {
  // Act
  const [tile] = toStrengthTrajectories([SQUAT]);

  // Assert — oldest-first rows with the latest bar flagged, and the signed delta pill
  assert.deepEqual(
    tile.trend.rows.map((row) => [row.label, row.estimate, row.isLatest]),
    [
      ["Jun 1", 100, false],
      ["Jul 4", 110, true],
    ],
  );
  assert.equal(tile.trend.delta, "+10 KG");
});

test("preserves the server's ranked order across multiple trajectories", () => {
  // Arrange — the API already ranks these; the view must not reorder them
  const press: ExerciseTrajectory = {
    exercise_id: 3,
    exercise: "Overhead Press",
    series: [{ date: "2026-07-01", estimated_1rm: 60 }],
  };

  // Act
  const tiles = toStrengthTrajectories([SQUAT, press]);

  // Assert
  assert.deepEqual(
    tiles.map((tile) => tile.exercise),
    ["Back Squat", "Overhead Press"],
  );
});

test("a single-session trajectory has rows but no delta pill", () => {
  // Arrange — one point: there is no trend to measure yet
  const press: ExerciseTrajectory = {
    exercise_id: 3,
    exercise: "Overhead Press",
    series: [{ date: "2026-07-01", estimated_1rm: 60 }],
  };

  // Act
  const [tile] = toStrengthTrajectories([press]);

  // Assert — the chart still renders one bar, but the delta pill is omitted
  assert.equal(tile.trend.rows.length, 1);
  assert.equal(tile.trend.delta, null);
});

test("no trajectories yields no tiles so the section can hide", () => {
  assert.deepEqual(toStrengthTrajectories([]), []);
});
