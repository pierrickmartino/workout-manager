import { test } from "node:test";
import assert from "node:assert/strict";

import { trainingTypeBadgeVariant } from "./training-type-badge.ts";

// The Training Type → Badge variant map (issue #397, Q9): a fixed, curated mapping onto the
// three Skin-aware accents (cyan / violet / magenta) plus the two neutral treatments, so the
// badge stays theme-aware rather than coded to an off-system fixed hue.

test("each curated Training Type maps to a distinct badge variant", () => {
  const variants = [
    trainingTypeBadgeVariant("strength"),
    trainingTypeBadgeVariant("cardio"),
    trainingTypeBadgeVariant("hiit"),
    trainingTypeBadgeVariant("yoga"),
    trainingTypeBadgeVariant("mobility"),
  ];
  // All five are distinct — a user can tell the categories apart at a glance.
  assert.equal(new Set(variants).size, 5);
});

test("strength / cardio / hiit take the three Skin accents", () => {
  assert.equal(trainingTypeBadgeVariant("strength"), "cyan");
  assert.equal(trainingTypeBadgeVariant("cardio"), "magenta");
  assert.equal(trainingTypeBadgeVariant("hiit"), "violet");
});

test("an uncurated type falls back to the neutral muted pill", () => {
  assert.equal(trainingTypeBadgeVariant("crossfit"), "muted");
});
