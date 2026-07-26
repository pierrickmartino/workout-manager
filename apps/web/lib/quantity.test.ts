import { test } from "node:test";
import assert from "node:assert/strict";

import {
  distanceInput,
  formatPace,
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

test("distanceInput builds the distance request fields with a unit and companion time", () => {
  // Act — a 10 km run in 52:00: the picked kind, its value, unit, and companion time
  const input = distanceInput("10", "km", "52:00");

  // Assert — the kind is authoritative; unit and duration ride through for the backend
  // to canonicalise to metres and derive pace from
  assert.deepEqual(input, {
    quantity_kind: "distance",
    quantity_value: "10",
    quantity_unit: "km",
    quantity_duration: "52:00",
  });
});

test("distanceInput sends a null companion time when the run was not timed", () => {
  // Act — a distance-only set: no time entered
  const input = distanceInput("5", "km", "");

  // Assert — a blank time is null, not an empty string, so pace stays underivable
  assert.equal(input.quantity_duration, null);
});

test("formatPace projects pace from a timed distance in the entered unit", () => {
  // Arrange — 10 km in 52:00, stored canonically in metres and seconds
  const quantity: Quantity = {
    kind: "distance",
    text: "10 km",
    metres: 10000,
    duration_s: 3120,
  };

  // Act / Assert — a read-time projection, never a stored figure: 5:12 per km
  assert.equal(formatPace(quantity), "5:12 /km");
});

test("formatPace projects miles pace in miles when the run was entered in miles", () => {
  // Arrange — 3 mi in 25:00
  const quantity: Quantity = {
    kind: "distance",
    text: "3 mi",
    metres: 1609.344 * 3,
    duration_s: 1500,
  };

  // Act / Assert — the pace unit follows the entered unit: 8:20 per mile
  assert.equal(formatPace(quantity), "8:20 /mi");
});

test("formatPace is null when pace is not derivable", () => {
  // Arrange — a distance with no time, a rep set, and no quantity at all
  const untimed: Quantity = { kind: "distance", text: "5 km", metres: 5000 };
  const reps: Quantity = { kind: "repetitions", text: "5", count: 5 };

  // Act / Assert — pace needs a distance *and* a time; nothing else qualifies
  assert.equal(formatPace(untimed), null);
  assert.equal(formatPace(reps), null);
  assert.equal(formatPace(null), null);
});

test("repetitionsInput builds the repetitions request fields from a rep count", () => {
  // Act — the log form turns the reps the user entered into the per-set request fields
  const input = repetitionsInput(5);

  // Assert — the picked kind is authoritative and the value is the rep count as text
  assert.deepEqual(input, { quantity_kind: "repetitions", quantity_value: "5" });
});
