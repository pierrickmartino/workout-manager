import { test } from "node:test";
import assert from "node:assert/strict";

import { toStrengthTrajectories } from "./strength-trajectories-view.ts";
import type { ExerciseTrajectory } from "./strength-analytics-types.ts";
import { INSUFFICIENT_HEADLINE, type ProgressStory } from "./progress-story-view.ts";

// `toStrengthTrajectories` shapes the ranked strength small-multiples (issue #177): one
// tile per qualifying Exercise, each carrying a link to its canonical Exercise Detail
// chart and the same Top-Set trend rows/delta the full chart uses (via `toTopSetTrend`).
// Pure and server-free.

const NO_STORY: ProgressStory = {
  kind: "insufficient",
  axis: null,
  load_kind: null,
  held: null,
  delta: null,
  latest: null,
  previous: null,
  body_weight: null,
};

// 8 then 10 reps at 60 kg — the same comparison the Exercise page would show.
const SQUAT_STORY: ProgressStory = {
  kind: "improved",
  axis: "reps_at_load",
  load_kind: "absolute",
  held: 60,
  delta: 2,
  latest: { logged_session_id: 42, performed_on: "2026-07-04", value: 10 },
  previous: { logged_session_id: 41, performed_on: "2026-06-01", value: 8 },
  body_weight: null,
};

const SQUAT: ExerciseTrajectory = {
  exercise_id: 7,
  exercise: "Back Squat",
  series: [
    { date: "2026-06-01", estimated_1rm: 100 },
    { date: "2026-07-04", estimated_1rm: 110 },
  ],
  story: SQUAT_STORY,
};

test("maps each trajectory to a tile linking to its Exercise Detail chart", () => {
  // Act
  const tiles = toStrengthTrajectories([SQUAT], "kg");

  // Assert — the tile carries the Exercise, a deep link (with the Analytics origin
  // so Exercise Detail's back link returns here), and the charted trend
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].exerciseId, 7);
  assert.equal(tiles[0].exercise, "Back Squat");
  assert.equal(tiles[0].href, "/exercises/7?from=%2Fanalytics%2Fstrength");
});

test("surfaces the latest top set as a whole-kilogram headline estimate", () => {
  // Arrange — a fractional Epley estimate must round for the eye
  const fractional: ExerciseTrajectory = {
    exercise_id: 9,
    exercise: "Bench Press",
    series: [{ date: "2026-07-01", estimated_1rm: 104.166 }],
    story: NO_STORY,
  };

  // Act
  const [tile] = toStrengthTrajectories([fractional], "kg");

  // Assert — the most recent session's top set, rounded, in kg
  assert.equal(tile.estimate, "104 kg");
});

test("builds a screen-reader label naming the lift, its latest top set, and trend", () => {
  // Act
  const [tile] = toStrengthTrajectories([SQUAT], "kg");

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
    story: NO_STORY,
  };

  // Act
  const [tile] = toStrengthTrajectories([press], "kg");

  // Assert
  assert.equal(
    tile.ariaLabel,
    "Overhead Press: latest top set 60 kg. View full chart.",
  );
});

test("reuses the Top-Set trend shaping for each tile's rows and delta", () => {
  // Act
  const [tile] = toStrengthTrajectories([SQUAT], "kg");

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
    story: NO_STORY,
  };

  // Act
  const tiles = toStrengthTrajectories([SQUAT, press], "kg");

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
    story: NO_STORY,
  };

  // Act
  const [tile] = toStrengthTrajectories([press], "kg");

  // Assert — the chart still renders one bar, but the delta pill is omitted
  assert.equal(tile.trend.rows.length, 1);
  assert.equal(tile.trend.delta, null);
});

test("no trajectories yields no tiles so the section can hide", () => {
  assert.deepEqual(toStrengthTrajectories([], "kg"), []);
});

test("projects the trajectory tile's headline estimate into the reader's pounds", () => {
  // Arrange — the standard squat trajectory, read by a lb user.
  // Act
  const [tile] = toStrengthTrajectories([SQUAT], "lb");

  // Assert — the headline estimate carries the lb unit, not kg.
  assert.ok(tile.estimate.endsWith(" lb"));
});

test("each tile tells its Exercise's progress story, linking both Logged Sessions", () => {
  // Act
  const [tile] = toStrengthTrajectories([SQUAT], "kg");

  // Assert — worded exactly as on the Exercise page, each side linking to its record
  assert.equal(tile.story.headline, "2 more reps at 60 kg than last time.");
  assert.deepEqual(
    tile.story.rows.map((row) => [row.label, row.performance, row.href]),
    [
      ["Last time", "8 reps at 60 kg", "/history/41"],
      ["Latest", "10 reps at 60 kg", "/history/42"],
    ],
  );
});

test("words a tile's progress story in the reader's pounds", () => {
  // Act
  const [tile] = toStrengthTrajectories([SQUAT], "lb");

  // Assert — the held load is projected, never shown in kg
  assert.ok(tile.story.headline.endsWith(" lb than last time."));
});

test("a tile with no comparable sessions carries the honest insufficient story", () => {
  // Arrange
  const press: ExerciseTrajectory = {
    exercise_id: 3,
    exercise: "Overhead Press",
    series: [{ date: "2026-07-01", estimated_1rm: 60 }],
    story: NO_STORY,
  };

  // Act
  const [tile] = toStrengthTrajectories([press], "kg");

  // Assert
  assert.equal(tile.story.headline, INSUFFICIENT_HEADLINE);
  assert.deepEqual(tile.story.rows, []);
});
