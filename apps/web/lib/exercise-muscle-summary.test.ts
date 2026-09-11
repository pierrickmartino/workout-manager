import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MUSCLE_SUMMARY_LIMIT,
  summarizeTargetedMuscles,
  formatMuscleSummary,
} from "./exercise-muscle-summary.ts";

// `exercise-muscle-summary` bounds an Exercise's flat targeted-muscle list for the
// compact catalog rows (the Library picker and Browse), so a many-muscle movement never
// blows past a mobile viewport. It shows the first few muscles in their stored order and
// discloses the rest as a "+K" remainder. Pure and server-free, unit-tested with
// `node --test`. The full list still lives on Exercise Detail.

test("returns every muscle when the count is under the limit", () => {
  // Arrange
  const muscles = ["Chest", "Triceps"];

  // Act
  const summary = summarizeTargetedMuscles(muscles);

  // Assert — nothing to hide, so no remainder
  assert.deepEqual(summary, { shown: ["Chest", "Triceps"], moreCount: 0 });
});

test("shows all muscles and no remainder when the count equals the limit", () => {
  // Arrange — exactly the cap is not "one too many"
  const muscles = ["Chest", "Triceps", "Shoulders"];

  // Act
  const summary = summarizeTargetedMuscles(muscles, 3);

  // Assert
  assert.deepEqual(summary, {
    shown: ["Chest", "Triceps", "Shoulders"],
    moreCount: 0,
  });
});

test("caps at the limit and counts the remainder when there are more", () => {
  // Arrange — the Running case from the report: 7 targeted muscles
  const muscles = [
    "Quadriceps",
    "Hamstrings",
    "Gluteus Maximus",
    "Gastrocnemius",
    "Soleus",
    "Hip Flexors",
    "Rectus Abdominis",
  ];

  // Act
  const summary = summarizeTargetedMuscles(muscles, 3);

  // Assert — first 3 in stored order, the other 4 disclosed as a count
  assert.deepEqual(summary, {
    shown: ["Quadriceps", "Hamstrings", "Gluteus Maximus"],
    moreCount: 4,
  });
});

test("preserves the stored order (no importance re-sorting)", () => {
  // Arrange — the flat list is not guaranteed primary-first; the summary must not reorder
  const muscles = ["Soleus", "Quadriceps", "Hamstrings", "Calves"];

  // Act
  const summary = summarizeTargetedMuscles(muscles, 2);

  // Assert
  assert.deepEqual(summary.shown, ["Soleus", "Quadriceps"]);
  assert.equal(summary.moreCount, 2);
});

test("handles an empty list without a remainder", () => {
  // Arrange / Act
  const summary = summarizeTargetedMuscles([]);

  // Assert
  assert.deepEqual(summary, { shown: [], moreCount: 0 });
});

test("does not mutate its input", () => {
  // Arrange
  const muscles = ["Quadriceps", "Hamstrings", "Gluteus Maximus", "Soleus"];
  const snapshot = [...muscles];

  // Act
  summarizeTargetedMuscles(muscles, 2);

  // Assert — the caller's array is untouched (immutability rule)
  assert.deepEqual(muscles, snapshot);
});

test("defaults to a limit of three", () => {
  // Arrange
  const muscles = ["A", "B", "C", "D"];

  // Act
  const summary = summarizeTargetedMuscles(muscles);

  // Assert — the exported constant is the default and is 3
  assert.equal(MUSCLE_SUMMARY_LIMIT, 3);
  assert.deepEqual(summary.shown, ["A", "B", "C"]);
  assert.equal(summary.moreCount, 1);
});

test("formats the shown muscles joined by a middot", () => {
  // Arrange / Act
  const label = formatMuscleSummary(["Chest", "Triceps"]);

  // Assert — natural case; the row's CSS applies the uppercase micro-label style
  assert.equal(label, "Chest · Triceps");
});

test("appends a +K token when muscles are hidden", () => {
  // Arrange / Act
  const label = formatMuscleSummary(
    ["Quadriceps", "Hamstrings", "Gluteus Maximus", "Soleus", "Calves"],
    3,
  );

  // Assert — the count discloses what the row does not spell out
  assert.equal(label, "Quadriceps · Hamstrings · Gluteus Maximus +2");
});

test("returns an empty string for no muscles", () => {
  // Arrange / Act / Assert — the caller decides whether to render at all
  assert.equal(formatMuscleSummary([]), "");
});
