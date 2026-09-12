import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PATTERN_ORDER,
  PATTERN_LABEL,
  PATTERN_BLURB,
  parseMovementPattern,
  type MovementPattern,
} from "./movement-pattern.ts";

// `movement-pattern` owns the presentation side of the field-guide taxonomy (ADR-0072):
// a label, a blurb, and the canonical order for each backend-classified pattern. Pure and
// server-free.

test("every pattern in the order has a label and a blurb", () => {
  // Arrange / Act / Assert — no section can render without both
  for (const pattern of PATTERN_ORDER) {
    assert.equal(typeof PATTERN_LABEL[pattern], "string");
    assert.ok(PATTERN_LABEL[pattern].length > 0);
    assert.equal(typeof PATTERN_BLURB[pattern], "string");
    assert.ok(PATTERN_BLURB[pattern].length > 0);
  }
});

test("general is always ordered last", () => {
  assert.equal(PATTERN_ORDER[PATTERN_ORDER.length - 1], "general");
});

test("the order lists each pattern exactly once", () => {
  const unique = new Set(PATTERN_ORDER);
  assert.equal(unique.size, PATTERN_ORDER.length);
});

test("parses a known wire token to itself", () => {
  assert.equal(parseMovementPattern("hinge"), "hinge");
});

test("defaults an unknown or legacy token to general", () => {
  // Arrange — a token an older or future API might emit
  const value = "plyometric";

  // Act
  const pattern: MovementPattern = parseMovementPattern(value);

  // Assert — never a broken section
  assert.equal(pattern, "general");
});
