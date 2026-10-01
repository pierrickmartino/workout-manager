import { test } from "node:test";
import assert from "node:assert/strict";

import { toIntOrZero } from "./numeric-input.ts";

test("a numeric field parses to a non-negative integer", () => {
  // Arrange / Act / Assert — a real count rides through.
  assert.equal(toIntOrZero("4"), 4);
  assert.equal(toIntOrZero("0"), 0);
});

test("a blank, garbled or negative entry settles at zero", () => {
  // The draft holds a number for the reducer, so none of these may become a NaN.
  assert.equal(toIntOrZero(""), 0);
  assert.equal(toIntOrZero("abc"), 0);
  assert.equal(toIntOrZero("-3"), 0);
});

test("a fractional entry truncates rather than rounding", () => {
  // `parseInt` stops at the separator — stated here because the fields it backs are counts and
  // seconds, where 7.9 seconds entered means 7, not 8.
  assert.equal(toIntOrZero("7.9"), 7);
});
