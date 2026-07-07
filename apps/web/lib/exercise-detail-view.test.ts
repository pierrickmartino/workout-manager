import { test } from "node:test";
import assert from "node:assert/strict";

import { toExerciseTab } from "./exercise-detail-view.ts";

// `toExerciseTab` narrows an untrusted ?tab= query value to one of the Exercise
// Detail tabs, defaulting to SPECS so refresh and shared links land somewhere
// honest. Pure and server-free.

test("resolves the SPECS tab from its query value", () => {
  // Arrange / Act / Assert
  assert.equal(toExerciseTab("specs"), "specs");
});

test("resolves the HISTORY and RECORDS tabs from their query values", () => {
  // Arrange / Act / Assert — a shared link to either tab lands on that tab
  assert.equal(toExerciseTab("history"), "history");
  assert.equal(toExerciseTab("records"), "records");
});

test("defaults to SPECS when no tab is in the URL", () => {
  // Arrange — a bare /exercises/[id] with no ?tab= query
  // Act
  const tab = toExerciseTab(undefined);

  // Assert
  assert.equal(tab, "specs");
});

test("falls back to SPECS for an unknown tab value", () => {
  // Arrange — a stale or hand-typed ?tab= value we don't recognise
  // Act
  const tab = toExerciseTab("bogus");

  // Assert — never render a broken tab; land on SPECS
  assert.equal(tab, "specs");
});
