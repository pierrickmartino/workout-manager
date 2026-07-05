import { test } from "node:test";
import assert from "node:assert/strict";

import { toAnalyticsRange } from "./analytics-types.ts";

// `toAnalyticsRange` narrows an untrusted ?range= query value to a valid window,
// falling back to the default so a hand-edited URL can never break the screen.

test("keeps a valid range value as-is", () => {
  // Arrange / Act / Assert
  assert.equal(toAnalyticsRange("7d"), "7d");
  assert.equal(toAnalyticsRange("30d"), "30d");
  assert.equal(toAnalyticsRange("90d"), "90d");
});

test("falls back to 7d when the range is missing", () => {
  // Arrange — a page opened with no ?range=
  const range = toAnalyticsRange(undefined);

  // Assert
  assert.equal(range, "7d");
});

test("falls back to 7d for an unknown range value", () => {
  // Arrange — a value outside the supported windows (e.g. an old 1Y link)
  const range = toAnalyticsRange("1y");

  // Assert — the honest default, never an invalid window
  assert.equal(range, "7d");
});
