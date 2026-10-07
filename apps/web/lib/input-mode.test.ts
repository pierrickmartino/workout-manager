import { test } from "node:test";
import assert from "node:assert/strict";

import { isFractionalStep, numericInputMode } from "./input-mode.ts";

test("asks for the decimal pad when the step admits a fraction", () => {
  // Arrange & Act & Assert
  assert.equal(isFractionalStep("any"), true);
  assert.equal(isFractionalStep("0.1"), true);
  assert.equal(isFractionalStep(0.5), true);
  assert.equal(isFractionalStep("0.50"), true);
});

test("asks for the whole-number pad when the step only admits integers", () => {
  // Arrange & Act & Assert
  assert.equal(isFractionalStep(undefined), false);
  assert.equal(isFractionalStep("1"), false);
  assert.equal(isFractionalStep(5), false);
  // An unparseable step is no evidence of a fraction, and `numeric` still types
  // a whole number — the browser's own validation decides what the field accepts.
  assert.equal(isFractionalStep(""), false);
  assert.equal(isFractionalStep("none"), false);
});

test("gives a number field the pad its step implies", () => {
  // Arrange & Act & Assert
  assert.equal(numericInputMode({ type: "number" }), "numeric");
  assert.equal(numericInputMode({ type: "number", step: 1 }), "numeric");
  assert.equal(numericInputMode({ type: "number", step: "0.1" }), "decimal");
  assert.equal(numericInputMode({ type: "number", step: "any" }), "decimal");
});

test("leaves every other field's keyboard to the platform", () => {
  // Arrange & Act & Assert: a text field may hold a colon, a hyphen or prose, and
  // a numeric pad offers none of them — the call site asks for one explicitly.
  assert.equal(numericInputMode({}), undefined);
  assert.equal(numericInputMode({ type: "text" }), undefined);
  assert.equal(numericInputMode({ type: "search" }), undefined);
  assert.equal(numericInputMode({ type: "email" }), undefined);
  assert.equal(numericInputMode({ type: "checkbox" }), undefined);
});
