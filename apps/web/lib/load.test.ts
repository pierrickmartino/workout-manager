import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatBodyWeight,
  formatLoad,
  loadKindOptions,
  loadToFields,
  loadValueToKg,
  NO_LOAD,
  type Load,
} from "./load.ts";
import { unitToKg } from "./weight-format.ts";

test("formatLoad renders an absolute load from its kg field, not the stored text", () => {
  // Arrange — the stored text is deliberately non-canonical to prove the string is
  // computed from the number, not echoed from `text`.
  const load: Load = { kind: "absolute", text: "70kg", kg: 70 };

  // Act
  const rendered = formatLoad(load, "kg");

  // Assert — the canonical "70 kg", byte-for-byte the app's kg output.
  assert.equal(rendered, "70 kg");
});

test("formatLoad keeps a fractional absolute load's decimals", () => {
  // Arrange
  const load: Load = { kind: "absolute", text: "72.5 kg", kg: 72.5 };

  // Act / Assert
  assert.equal(formatLoad(load, "kg"), "72.5 kg");
});

test("formatLoad drops a trailing .0 on a whole absolute load", () => {
  // Arrange — a whole number that could surface as "70.0"
  const load: Load = { kind: "absolute", text: "70 kg", kg: 70.0 };

  // Act / Assert — rendered as "70 kg", never "70.0 kg"
  assert.equal(formatLoad(load, "kg"), "70 kg");
});

test("formatLoad projects an absolute load into the reader's pounds", () => {
  // Arrange — a canonical 70 kg absolute load; the reader's unit is lb.
  const load: Load = { kind: "absolute", text: "70 kg", kg: 70 };

  // Act / Assert — 70 kg ≈ 154.32 lb, rounded at the display boundary.
  assert.equal(formatLoad(load, "lb"), "154.32 lb");
});

test("formatLoad renders weighted bodyweight from its added kg", () => {
  // Arrange
  const load: Load = { kind: "bodyweight", text: "BW+5", added_kg: 5 };

  // Act / Assert — computed from the number, canonical "bodyweight + 5 kg"
  assert.equal(formatLoad(load, "kg"), "bodyweight + 5 kg");
});

test("formatLoad projects weighted bodyweight's added load into pounds", () => {
  // Arrange — 20 kg added on a belt, reader in lb
  const load: Load = { kind: "bodyweight", text: "BW+20", added_kg: 20 };

  // Act / Assert — 20 kg ≈ 44.09 lb
  assert.equal(formatLoad(load, "lb"), "bodyweight + 44.09 lb");
});

test("formatLoad leaves pure bodyweight on its stored text in any unit", () => {
  // Arrange — pure bodyweight carries no numeric field, so its text stays authoritative
  const load: Load = { kind: "bodyweight", text: "bodyweight" };

  // Act / Assert — unaffected by the reader's unit
  assert.equal(formatLoad(load, "kg"), "bodyweight");
  assert.equal(formatLoad(load, "lb"), "bodyweight");
});

test("formatLoad renders a range from its numeric bounds", () => {
  // Arrange
  const load: Load = { kind: "range", text: "10 - 20 kg", low_kg: 10, high_kg: 20 };

  // Act / Assert — canonical "10-20 kg" from the bounds, not the spaced stored text
  assert.equal(formatLoad(load, "kg"), "10-20 kg");
});

test("formatLoad projects a range's bounds into pounds", () => {
  // Arrange
  const load: Load = { kind: "range", text: "10-20 kg", low_kg: 10, high_kg: 20 };

  // Act / Assert — both bounds converted, one shared unit label
  assert.equal(formatLoad(load, "lb"), "22.05-44.09 lb");
});

test("formatLoad leaves a percent-of-1RM load unaffected in any unit", () => {
  // Arrange — a percent-of-1RM load as the API serializes it
  const load: Load = { kind: "percent_1rm", text: "70% 1RM", percent: 70 };

  // Act / Assert — a percentage is unit-agnostic; the display uses the preserved text
  assert.equal(formatLoad(load, "kg"), "70% 1RM");
  assert.equal(formatLoad(load, "lb"), "70% 1RM");
});

test("formatLoad leaves a qualitative load unaffected in any unit", () => {
  // Arrange
  const load: Load = { kind: "qualitative", text: "as heavy as feels safe" };

  // Act / Assert
  assert.equal(formatLoad(load, "kg"), "as heavy as feels safe");
  assert.equal(formatLoad(load, "lb"), "as heavy as feels safe");
});

test("formatLoad falls back to the stored text when a numeric field is absent", () => {
  // Arrange — a malformed absolute load missing its kg number
  const load: Load = { kind: "absolute", text: "heavy" };

  // Act / Assert — the text is the only signal left, so it is used
  assert.equal(formatLoad(load, "kg"), "heavy");
});

test("formatLoad falls back to an em dash when no load was recorded", () => {
  // Act / Assert — both null and undefined read as "no load"
  assert.equal(formatLoad(null, "kg"), NO_LOAD);
  assert.equal(formatLoad(undefined, "lb"), NO_LOAD);
});

test("formatBodyWeight renders a captured mass in kilograms", () => {
  // Act / Assert
  assert.equal(formatBodyWeight(82, "kg"), "82 kg");
  assert.equal(formatBodyWeight(81.6, "kg"), "81.6 kg");
});

test("formatBodyWeight projects a captured mass into pounds", () => {
  // Act / Assert — 82 kg ≈ 180.78 lb
  assert.equal(formatBodyWeight(82, "lb"), "180.78 lb");
});

test("formatBodyWeight falls back to an em dash when no mass was on file", () => {
  // Act / Assert — null and undefined both read as "no body weight"
  assert.equal(formatBodyWeight(null, "kg"), NO_LOAD);
  assert.equal(formatBodyWeight(undefined, "lb"), NO_LOAD);
});

test("loadToFields pre-fills an absolute value in kilograms unchanged", () => {
  // Act / Assert — a kg reader sees the stored kilograms verbatim
  assert.deepEqual(loadToFields({ kind: "absolute", text: "70 kg", kg: 70 }, "kg"), {
    loadKind: "absolute",
    loadValue: "70",
  });
});

test("loadToFields projects an absolute value into the reader's pounds", () => {
  // Act / Assert — 70 kg pre-fills as 154.32 lb for a lb reader
  assert.deepEqual(loadToFields({ kind: "absolute", text: "70 kg", kg: 70 }, "lb"), {
    loadKind: "absolute",
    loadValue: "154.32",
  });
});

test("loadToFields leaves a percent value unit-agnostic", () => {
  assert.deepEqual(
    loadToFields({ kind: "percent_1rm", text: "70% 1RM", percent: 70 }, "lb"),
    { loadKind: "percent_1rm", loadValue: "70" },
  );
});

test("loadToFields projects a range's bounds into pounds", () => {
  assert.deepEqual(
    loadToFields({ kind: "range", text: "10-20 kg", low_kg: 10, high_kg: 20 }, "lb"),
    { loadKind: "range", loadValue: "22.05-44.09" },
  );
});

test("loadValueToKg passes a kilogram entry through verbatim", () => {
  // A kg reader's submission is byte-for-byte unchanged.
  assert.equal(loadValueToKg("absolute", "70", "kg"), "70");
  assert.equal(loadValueToKg("range", "10-20", "kg"), "10-20");
});

test("loadValueToKg converts an absolute pound entry to exact kilograms", () => {
  // Act / Assert — 155 lb → 155 * 0.45359237 kg, no rounding on the way in.
  assert.equal(loadValueToKg("absolute", "155", "lb"), String(unitToKg(155, "lb")));
});

test("loadValueToKg round-trips a pound entry back to the same display value", () => {
  // Arrange — enter, convert to kg, store, then re-render for the same lb reader.
  const kgString = loadValueToKg("absolute", "155", "lb");

  // Act / Assert — the stored kilograms project back to 155 lb (no drift).
  assert.equal(formatLoad({ kind: "absolute", text: "", kg: Number(kgString) }, "lb"), "155 lb");
});

test("loadValueToKg converts a bodyweight added-load pound entry to kilograms", () => {
  assert.equal(loadValueToKg("bodyweight", "44", "lb"), String(unitToKg(44, "lb")));
});

test("loadValueToKg converts both bounds of a range pound entry", () => {
  assert.equal(
    loadValueToKg("range", "20-40", "lb"),
    `${unitToKg(20, "lb")}-${unitToKg(40, "lb")}`,
  );
});

test("loadValueToKg leaves percent and qualitative values unit-agnostic", () => {
  assert.equal(loadValueToKg("percent_1rm", "70", "lb"), "70");
  assert.equal(loadValueToKg("qualitative", "as heavy as safe", "lb"), "as heavy as safe");
});

test("loadValueToKg passes a blank or unparseable value through untouched", () => {
  assert.equal(loadValueToKg("absolute", "", "lb"), "");
  assert.equal(loadValueToKg("absolute", "heavy", "lb"), "heavy");
  assert.equal(loadValueToKg("range", "not-a-range", "lb"), "not-a-range");
});

test("loadKindOptions labels the absolute kind with the active unit", () => {
  // Act / Assert — the hardcoded "(kg)" is replaced by the reader's unit.
  assert.equal(loadKindOptions("kg")[0].label, "Weight (kg)");
  assert.equal(loadKindOptions("lb")[0].label, "Weight (lb)");
});
