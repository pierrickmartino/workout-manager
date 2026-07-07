import { test } from "node:test";
import assert from "node:assert/strict";

import { toExerciseTab, toExecutionSteps } from "./exercise-detail-view.ts";

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

// `toExecutionSteps` decides how the ordered Execution Steps (ADR-0015) render:
// 2+ steps become a numbered `01…0N` list, a single step becomes an un-numbered
// guidance block (never a lone "01"), and no steps render nothing. The step count
// always equals what the author wrote — this helper never chops or fabricates.

test("renders two or more steps as a zero-padded numbered list", () => {
  // Arrange — a three-step how-to
  const result = toExecutionSteps([
    "Brace your core.",
    "Unrack the bar.",
    "Sit down between your hips.",
  ]);

  // Assert — a numbered list with zero-padded ordinals in author order
  assert.deepEqual(result, {
    kind: "numbered",
    steps: [
      { ordinal: "01", text: "Brace your core." },
      { ordinal: "02", text: "Unrack the bar." },
      { ordinal: "03", text: "Sit down between your hips." },
    ],
  });
});

test("renders a single step as an un-numbered guidance block", () => {
  // Arrange — one authored paragraph
  const result = toExecutionSteps([
    "Slide down a wall until your thighs are parallel.",
  ]);

  // Assert — a single guidance block, never a lone "01"
  assert.deepEqual(result, {
    kind: "single",
    step: "Slide down a wall until your thighs are parallel.",
  });
});

test("renders no steps as empty so nothing is shown", () => {
  // Assert — an Exercise with no authored steps renders no Execution Steps block
  assert.deepEqual(toExecutionSteps([]), { kind: "empty" });
});

test("zero-pads ordinals to two digits past nine", () => {
  // Arrange — a ten-step list crosses the single-digit boundary
  const steps = Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`);

  // Act
  const result = toExecutionSteps(steps);

  // Assert — the tenth ordinal is "10", the first "01"
  assert.equal(result.kind, "numbered");
  if (result.kind === "numbered") {
    assert.equal(result.steps[0].ordinal, "01");
    assert.equal(result.steps[9].ordinal, "10");
  }
});

test("drops blank entries so the step count stays honest", () => {
  // Arrange — a stray blank/whitespace entry must not become a fabricated step
  const result = toExecutionSteps(["Set your feet.", "   ", "Drive up."]);

  // Assert — only the two real steps survive, still numbered honestly
  assert.deepEqual(result, {
    kind: "numbered",
    steps: [
      { ordinal: "01", text: "Set your feet." },
      { ordinal: "02", text: "Drive up." },
    ],
  });
});
