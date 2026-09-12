import { test } from "node:test";
import assert from "node:assert/strict";

import { plainMuscleSummary } from "./plain-muscle-summary.ts";

// `plain-muscle-summary` turns a raw targeted-muscle list into the field-guide's
// plain-language sentence (ADR-0072). Pure and server-free.

test("returns an empty string for no muscles so the caller can omit the line", () => {
  assert.equal(plainMuscleSummary([]), "");
});

test("phrases a single muscle", () => {
  assert.equal(plainMuscleSummary(["Chest"]), "Builds your chest.");
});

test("joins two muscles with 'and'", () => {
  assert.equal(plainMuscleSummary(["Chest", "Triceps"]), "Builds your chest and triceps.");
});

test("uses an Oxford comma for three muscles", () => {
  assert.equal(
    plainMuscleSummary(["Chest", "Shoulders", "Triceps"]),
    "Builds your chest, shoulders, and triceps.",
  );
});

test("collapses the overflow beyond the limit into 'N more'", () => {
  // Arrange — five muscles, limit is three
  const muscles = ["Chest", "Shoulders", "Triceps", "Core", "Forearms"];

  // Act
  const summary = plainMuscleSummary(muscles);

  // Assert — first three spelled out, the last two folded in
  assert.equal(summary, "Builds your chest, shoulders, triceps, and 2 more.");
});
