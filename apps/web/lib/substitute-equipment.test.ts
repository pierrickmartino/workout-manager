import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUBSTITUTE_EQUIPMENT_OPTIONS,
  isBodyweightOnly,
  prefillSubstituteEquipment,
  readSubstituteEquipment,
  substituteEquipmentSummary,
  toggleSubstituteEquipment,
} from "./substitute-equipment.ts";

test("the picker is pre-filled with the Default Equipment, in canonical order", () => {
  // Arrange — the Profile's canonical Default Equipment, out of order
  const defaultEquipment = ["pull-up bar", "dumbbell"];

  // Act
  const selected = prefillSubstituteEquipment(defaultEquipment);

  // Assert
  assert.deepEqual(selected, ["dumbbell", "pull-up bar"]);
});

test("the pre-fill drops tokens the picker does not offer", () => {
  // "other" names no real equipment and "bodyweight" needs none, so neither is a pickable option
  const selected = prefillSubstituteEquipment(["other", "bodyweight", "barbell", "laser"]);

  assert.deepEqual(selected, ["barbell"]);
});

test("the options exclude bodyweight and other", () => {
  assert.ok(!SUBSTITUTE_EQUIPMENT_OPTIONS.includes("bodyweight"));
  assert.ok(!SUBSTITUTE_EQUIPMENT_OPTIONS.includes("other"));
  assert.equal(SUBSTITUTE_EQUIPMENT_OPTIONS[0], "barbell");
});

test("toggling adds an absent item and removes a present one, never mutating", () => {
  // Arrange
  const selected = ["dumbbell"] as const;

  // Act
  const added = toggleSubstituteEquipment(selected, "barbell");
  const removed = toggleSubstituteEquipment(added, "dumbbell");

  // Assert
  assert.deepEqual(added, ["barbell", "dumbbell"]);
  assert.deepEqual(removed, ["barbell"]);
  assert.deepEqual(selected, ["dumbbell"]);
});

test("an empty selection is bodyweight only and says so", () => {
  assert.equal(isBodyweightOnly([]), true);
  assert.equal(substituteEquipmentSummary([]), "Bodyweight only");
});

test("a selection summarizes as its labels", () => {
  assert.equal(isBodyweightOnly(["dumbbell"]), false);
  assert.equal(
    substituteEquipmentSummary(["dumbbell", "pull-up bar"]),
    "Dumbbell, Pull-Up Bar",
  );
});

test("a form that never showed the picker states no equipment", () => {
  // Omitted equipment inherits the Default Equipment on the server (ADR-0038)
  const form = new FormData();

  assert.equal(readSubstituteEquipment(form), undefined);
});

test("a stated form with no items is an explicit bodyweight-only choice", () => {
  const form = new FormData();
  form.set("equipment_stated", "1");

  assert.deepEqual(readSubstituteEquipment(form), []);
});

test("a stated form keeps only picker options, in canonical order", () => {
  // Arrange — a tampered value outside the vocabulary rides along
  const form = new FormData();
  form.set("equipment_stated", "1");
  form.append("available_equipment", "pull-up bar");
  form.append("available_equipment", "hoverboard");
  form.append("available_equipment", "dumbbell");

  // Act
  const equipment = readSubstituteEquipment(form);

  // Assert
  assert.deepEqual(equipment, ["dumbbell", "pull-up bar"]);
});
