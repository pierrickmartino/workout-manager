import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CALISTHENICS_PRESET,
  applyEquipmentPreset,
  initialEquipmentText,
  parseEquipment,
} from "./equipment-presets.ts";

test("initial equipment text pre-fills the field from saved Default Equipment", () => {
  // Arrange — the user's saved Default Equipment
  const defaultEquipment = ["dumbbells", "pull-up bar"];

  // Act
  const text = initialEquipmentText(defaultEquipment);

  // Assert — shown comma-separated, ready to edit
  assert.equal(text, "dumbbells, pull-up bar");
});

test("initial equipment text round-trips back to the same items", () => {
  // Arrange / Act — pre-fill, then parse it as the request does
  const text = initialEquipmentText(["dumbbells", "pull-up bar"]);

  // Assert — reaches the generation request as the saved Default Equipment
  assert.deepEqual(parseEquipment(text), ["dumbbells", "pull-up bar"]);
});

test("no saved Default Equipment leaves the field blank (bodyweight)", () => {
  // Arrange — a user who saved nothing
  // Act / Assert — blank field, which the request sends as an empty list
  assert.equal(initialEquipmentText([]), "");
});

test("applying a preset to a blank field yields the preset items", () => {
  // Arrange — an empty equipment field (blank means bodyweight)
  const current = "";

  // Act
  const next = applyEquipmentPreset(current, CALISTHENICS_PRESET.items);

  // Assert — the four calisthenics items, comma-separated
  assert.equal(next, "pull-up bar, rings, parallettes, dip bars");
});

test("the populated value parses back to exactly the preset items", () => {
  // Arrange / Act — populate a blank field, then parse it as the request does
  const populated = applyEquipmentPreset("", CALISTHENICS_PRESET.items);

  // Assert — reaches the generation request identically to hand-typed equipment
  assert.deepEqual(parseEquipment(populated), [
    "pull-up bar",
    "rings",
    "parallettes",
    "dip bars",
  ]);
});

test("applying a preset keeps what the user typed and does not duplicate", () => {
  // Arrange — the user already typed a non-preset item and one preset item
  // (in different casing) by hand
  const current = "dumbbells, Rings";

  // Act
  const next = applyEquipmentPreset(current, CALISTHENICS_PRESET.items);

  // Assert — existing kept, "Rings" not re-added, the rest appended in order
  assert.equal(next, "dumbbells, Rings, pull-up bar, parallettes, dip bars");
});

test("applying the same preset twice is idempotent", () => {
  // Arrange — a field already populated by one tap of the preset
  const once = applyEquipmentPreset("", CALISTHENICS_PRESET.items);

  // Act — a second tap
  const twice = applyEquipmentPreset(once, CALISTHENICS_PRESET.items);

  // Assert — no accumulation of duplicates
  assert.equal(twice, once);
});
