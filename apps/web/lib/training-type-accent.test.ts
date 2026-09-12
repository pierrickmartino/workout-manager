import { test } from "node:test";
import assert from "node:assert/strict";

import { accentTint, trainingTypeAccentVar } from "./training-type-accent.ts";

// `training-type-accent` maps a Training Type to the Skin-aware accent token the Workout
// Signature sigil fills with (CONTEXT: Workout Signature, Training Type). Pure and curated —
// the same species as `training-type-badge`, tested the same way.

test("maps each curated Training Type to its accent token", () => {
  assert.equal(trainingTypeAccentVar("strength"), "--color-cyan");
  assert.equal(trainingTypeAccentVar("cardio"), "--color-magenta");
  assert.equal(trainingTypeAccentVar("hiit"), "--color-violet");
  assert.equal(trainingTypeAccentVar("yoga"), "--color-blue");
  assert.equal(trainingTypeAccentVar("mobility"), "--color-text-muted");
});

test("falls back to the neutral muted token for an uncurated type", () => {
  assert.equal(trainingTypeAccentVar("crossfit"), "--color-text-muted");
  assert.equal(trainingTypeAccentVar(""), "--color-text-muted");
});

test("accentTint builds a Skin-aware color-mix at the given alpha", () => {
  assert.equal(
    accentTint("--color-cyan", 0.3),
    "color-mix(in srgb, var(--color-cyan) 30%, transparent)",
  );
});

test("accentTint clamps alpha into [0, 1]", () => {
  assert.equal(
    accentTint("--color-violet", 1.5),
    "color-mix(in srgb, var(--color-violet) 100%, transparent)",
  );
  assert.equal(
    accentTint("--color-violet", -0.2),
    "color-mix(in srgb, var(--color-violet) 0%, transparent)",
  );
});
