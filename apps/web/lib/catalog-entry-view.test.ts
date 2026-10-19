import { test } from "node:test";
import assert from "node:assert/strict";

import {
  catalogEntryFacts,
  difficultyBandLabel,
  patternAnchorId,
} from "./catalog-entry-view.ts";
import type { ExerciseSearchResult } from "./exercises-types.ts";

// The catalog index row's one facts line (ADR-0072): muscles, kit and level in plain words,
// so a row reads without a legend. Pure and server-free.

function entry(overrides: Partial<ExerciseSearchResult> = {}): ExerciseSearchResult {
  return {
    id: 1,
    name: "Barbell Back Squat",
    targeted_muscles: ["quadriceps", "glutes"],
    required_equipment: ["barbell"],
    difficulty: 5,
    provenance: "curated",
    movement_pattern: "squat",
    equipment: ["barbell", "rack"],
    ...overrides,
  };
}

test("difficulty bands mirror the backend's 1–3 / 4–7 / 8–10 ranges", () => {
  assert.equal(difficultyBandLabel(1), "Beginner");
  assert.equal(difficultyBandLabel(3), "Beginner");
  assert.equal(difficultyBandLabel(4), "Intermediate");
  assert.equal(difficultyBandLabel(7), "Intermediate");
  assert.equal(difficultyBandLabel(8), "Advanced");
  assert.equal(difficultyBandLabel(10), "Advanced");
});

test("an unset or out-of-range difficulty has no band rather than a forced one", () => {
  assert.equal(difficultyBandLabel(null), null);
  assert.equal(difficultyBandLabel(0), null);
  assert.equal(difficultyBandLabel(11), null);
});

test("the facts line joins muscles, kit and level", () => {
  // Arrange / Act
  const facts = catalogEntryFacts(entry());

  // Assert
  assert.equal(facts, "Quadriceps, Glutes · Barbell + Rack · Intermediate");
});

test("muscles beyond three fold into a count so the line stays a glance", () => {
  const facts = catalogEntryFacts(
    entry({ targeted_muscles: ["hamstrings", "glutes", "core", "calves"], difficulty: null }),
  );

  assert.equal(facts, "Hamstrings, Glutes, Core +1 · Barbell + Rack");
});

test("no equipment, or bodyweight only, reads as Bodyweight", () => {
  assert.match(catalogEntryFacts(entry({ equipment: [] })), /· Bodyweight ·/);
  assert.match(catalogEntryFacts(entry({ equipment: ["bodyweight"] })), /· Bodyweight ·/);
});

test("a movement with no muscles yet leaves that part out instead of a blank", () => {
  const facts = catalogEntryFacts(entry({ targeted_muscles: [], difficulty: 2 }));

  assert.equal(facts, "Barbell + Rack · Beginner");
});

test("a pattern's anchor id is stable and unique per pattern", () => {
  assert.equal(patternAnchorId("squat"), "pattern-squat");
  assert.notEqual(patternAnchorId("push"), patternAnchorId("pull"));
});
