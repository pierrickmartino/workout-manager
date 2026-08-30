import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatBodyWeight,
  formatKg,
  formatLoad,
  NO_LOAD,
  type Load,
} from "./load.ts";

test("formatLoad renders an absolute load from its kg field, not the stored text", () => {
  // Arrange — the stored text is deliberately non-canonical to prove the string is
  // computed from the number, not echoed from `text`.
  const load: Load = { kind: "absolute", text: "70kg", kg: 70 };

  // Act
  const rendered = formatLoad(load);

  // Assert — the canonical "70 kg", byte-for-byte the app's kg output.
  assert.equal(rendered, "70 kg");
});

test("formatLoad keeps a fractional absolute load's decimals", () => {
  // Arrange
  const load: Load = { kind: "absolute", text: "72.5 kg", kg: 72.5 };

  // Act / Assert
  assert.equal(formatLoad(load), "72.5 kg");
});

test("formatLoad drops a trailing .0 on a whole absolute load", () => {
  // Arrange — a whole number that could surface as "70.0"
  const load: Load = { kind: "absolute", text: "70 kg", kg: 70.0 };

  // Act / Assert — rendered as "70 kg", never "70.0 kg"
  assert.equal(formatLoad(load), "70 kg");
});

test("formatLoad renders weighted bodyweight from its added kg", () => {
  // Arrange
  const load: Load = { kind: "bodyweight", text: "BW+5", added_kg: 5 };

  // Act / Assert — computed from the number, canonical "bodyweight + 5 kg"
  assert.equal(formatLoad(load), "bodyweight + 5 kg");
});

test("formatLoad leaves pure bodyweight on its stored text", () => {
  // Arrange — pure bodyweight carries no numeric field, so its text stays authoritative
  const load: Load = { kind: "bodyweight", text: "bodyweight" };

  // Act / Assert
  assert.equal(formatLoad(load), "bodyweight");
});

test("formatLoad renders a range from its numeric bounds", () => {
  // Arrange
  const load: Load = { kind: "range", text: "10 - 20 kg", low_kg: 10, high_kg: 20 };

  // Act / Assert — canonical "10-20 kg" from the bounds, not the spaced stored text
  assert.equal(formatLoad(load), "10-20 kg");
});

test("formatLoad leaves a percent-of-1RM load unaffected", () => {
  // Arrange — a percent-of-1RM load as the API serializes it
  const load: Load = { kind: "percent_1rm", text: "70% 1RM", percent: 70 };

  // Act / Assert — the display uses the preserved text verbatim
  assert.equal(formatLoad(load), "70% 1RM");
});

test("formatLoad leaves a qualitative load unaffected", () => {
  // Arrange
  const load: Load = { kind: "qualitative", text: "as heavy as feels safe" };

  // Act / Assert
  assert.equal(formatLoad(load), "as heavy as feels safe");
});

test("formatLoad falls back to the stored text when a numeric field is absent", () => {
  // Arrange — a malformed absolute load missing its kg number
  const load: Load = { kind: "absolute", text: "heavy" };

  // Act / Assert — the text is the only signal left, so it is used
  assert.equal(formatLoad(load), "heavy");
});

test("formatLoad falls back to an em dash when no load was recorded", () => {
  // Act / Assert — both null and undefined read as "no load"
  assert.equal(formatLoad(null), NO_LOAD);
  assert.equal(formatLoad(undefined), NO_LOAD);
});

test("formatKg renders a whole kilogram figure without a trailing .0", () => {
  // Act / Assert
  assert.equal(formatKg(70), "70 kg");
  assert.equal(formatKg(72.5), "72.5 kg");
});

test("formatBodyWeight renders a captured mass in kilograms", () => {
  // Act / Assert
  assert.equal(formatBodyWeight(82), "82 kg");
  assert.equal(formatBodyWeight(81.6), "81.6 kg");
});

test("formatBodyWeight falls back to an em dash when no mass was on file", () => {
  // Act / Assert — null and undefined both read as "no body weight"
  assert.equal(formatBodyWeight(null), NO_LOAD);
  assert.equal(formatBodyWeight(undefined), NO_LOAD);
});
