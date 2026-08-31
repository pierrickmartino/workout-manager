import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KG_PER_LB,
  formatWeight,
  formatWeightNumber,
  formatWholeWeight,
  kgToUnit,
  unitToKg,
  weightUnitLabel,
  wholeWeightInUnit,
} from "./weight-format.ts";

test("KG_PER_LB is the exact international-pound factor", () => {
  // The exact definition, so a lb entry converts to kilograms without baking in
  // rounding at the storage boundary.
  assert.equal(KG_PER_LB, 0.45359237);
});

test("weightUnitLabel returns the unit's short label", () => {
  assert.equal(weightUnitLabel("kg"), "kg");
  assert.equal(weightUnitLabel("lb"), "lb");
});

test("kgToUnit passes kilograms through unchanged", () => {
  // Arrange / Act / Assert — kg is the canonical unit, so no conversion.
  assert.equal(kgToUnit(70, "kg"), 70);
});

test("kgToUnit projects kilograms into pounds", () => {
  // 100 kg is ~220.462 lb.
  assert.ok(Math.abs(kgToUnit(100, "lb") - 220.46226218) < 1e-6);
});

test("unitToKg passes kilograms through unchanged", () => {
  assert.equal(unitToKg(70, "kg"), 70);
});

test("unitToKg converts a pound entry to exact kilograms", () => {
  // 155 lb → 155 * 0.45359237 kg, exactly, no rounding on the way in.
  assert.equal(unitToKg(155, "lb"), 155 * KG_PER_LB);
});

test("a pound entry round-trips through storage with no drift", () => {
  // Arrange — the user enters a whole number of pounds.
  const entered = 155;

  // Act — store as exact kilograms, then project back for display.
  const storedKg = unitToKg(entered, "lb");
  const shown = formatWeightNumber(storedKg, "lb");

  // Assert — the same value comes back, float noise removed at the display boundary.
  assert.equal(shown, "155");
});

test("a fractional pound entry round-trips with no drift", () => {
  const storedKg = unitToKg(154.5, "lb");
  assert.equal(formatWeightNumber(storedKg, "lb"), "154.5");
});

test("formatWeightNumber keeps a whole kilogram without a trailing .0", () => {
  assert.equal(formatWeightNumber(70, "kg"), "70");
});

test("formatWeightNumber keeps a fractional kilogram, including a micro-plate", () => {
  assert.equal(formatWeightNumber(72.5, "kg"), "72.5");
  assert.equal(formatWeightNumber(72.25, "kg"), "72.25");
});

test("formatWeightNumber rounds a projected figure to at most two decimals", () => {
  // 60 kg is 132.277357… lb — rounded to two decimals at the display boundary only.
  assert.equal(formatWeightNumber(60, "lb"), "132.28");
});

test("formatWeight appends the unit label", () => {
  assert.equal(formatWeight(70, "kg"), "70 kg");
  assert.equal(formatWeight(unitToKg(155, "lb"), "lb"), "155 lb");
});

test("formatWholeWeight rounds to a whole figure in the reader's unit", () => {
  // Estimated 1RM / PR precision: a whole number with the unit label.
  assert.equal(formatWholeWeight(142, "kg"), "142 kg");
  // 142 kg ≈ 313.06 lb → "313 lb"
  assert.equal(formatWholeWeight(142, "lb"), "313 lb");
});

test("wholeWeightInUnit projects and rounds a figure (or delta) to a whole number", () => {
  assert.equal(wholeWeightInUnit(142, "kg"), 142);
  assert.equal(wholeWeightInUnit(142, "lb"), 313);
  // A kilogram delta converts linearly — 10 kg gained ≈ 22 lb gained.
  assert.equal(wholeWeightInUnit(10, "lb"), 22);
});
