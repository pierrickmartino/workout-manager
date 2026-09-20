import { test } from "node:test";
import assert from "node:assert/strict";

import { analyticsBackOrigin } from "./analytics-nav.ts";

// `analyticsBackOrigin` builds the `?from=` origin the Analytics hub threads onto its
// child links, so a child's BackLink returns the user to the window they left. Pure and
// server-free.

test("returns the bare hub path for the default window", () => {
  // Arrange — a user who never touched the range toggle is served the 30d floor
  // Act / Assert — the origin carries no redundant ?range=30d
  assert.equal(analyticsBackOrigin("30d"), "/analytics");
});

test("encodes a non-default window so back returns to it", () => {
  // Assert — back from a child lands on the exact window the user left
  assert.equal(analyticsBackOrigin("90d"), "/analytics?range=90d");
  assert.equal(analyticsBackOrigin("150d"), "/analytics?range=150d");
});
