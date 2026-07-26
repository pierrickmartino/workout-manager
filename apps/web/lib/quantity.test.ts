import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatQuantity,
  NO_QUANTITY,
  quantityReps,
  repetitionsInput,
  type Quantity,
} from "./quantity.ts";

test("formatQuantity shows the stored text of a repetitions quantity", () => {
  // Arrange — a rep count as the API serializes it
  const quantity: Quantity = { kind: "repetitions", text: "5", count: 5 };

  // Act
  const rendered = formatQuantity(quantity);

  // Assert — the display uses the preserved text verbatim, unchanged from the old reps
  assert.equal(rendered, "5");
});

test("formatQuantity shows a distance's display text with its unit", () => {
  // Arrange — a 5 km run: metres is canonical, text keeps the entered unit
  const quantity: Quantity = { kind: "distance", text: "5 km", metres: 5000 };

  // Act / Assert — the UI reads the display-ready text, never re-deriving from metres
  assert.equal(formatQuantity(quantity), "5 km");
});

test("formatQuantity falls back to an em dash when no amount was recorded", () => {
  // Act / Assert — both null and undefined read as "no amount"
  assert.equal(formatQuantity(null), NO_QUANTITY);
  assert.equal(formatQuantity(undefined), NO_QUANTITY);
});

test("quantityReps returns the count for a repetitions quantity", () => {
  // Arrange
  const quantity: Quantity = { kind: "repetitions", text: "8", count: 8 };

  // Act / Assert — the number is available for a surface that needs it, not just text
  assert.equal(quantityReps(quantity), 8);
});

test("quantityReps is null for a non-rep amount and for no amount", () => {
  // Arrange — a run carries no rep count
  const distance: Quantity = { kind: "distance", text: "5 km", metres: 5000 };

  // Act / Assert — a non-rep amount, and an absent one, both have no rep count
  assert.equal(quantityReps(distance), null);
  assert.equal(quantityReps(null), null);
});

test("repetitionsInput builds the repetitions request fields from a rep count", () => {
  // Act — the log form turns the reps the user entered into the per-set request fields
  const input = repetitionsInput(5);

  // Assert — the picked kind is authoritative and the value is the rep count as text
  assert.deepEqual(input, { quantity_kind: "repetitions", quantity_value: "5" });
});
