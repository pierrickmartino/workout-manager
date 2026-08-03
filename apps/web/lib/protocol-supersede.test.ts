import { test } from "node:test";
import assert from "node:assert/strict";

import { supersedeWarning } from "./protocol-supersede.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// A minimal Current Protocol fixture — only the fields the guard reads
// (`completed_count`, `label`, `name`) carry meaning; the rest are harmless
// placeholders so the fixture type-checks.
function makeCurrent(
  overrides: Partial<ProtocolProgress> = {},
): ProtocolProgress {
  return {
    id: 1,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "hypertrophy",
    sessions_per_week: 3,
    weeks: 4,
    duration_minutes: 45,
    name: null,
    label: "hypertrophy · strength",
    sessions: [],
    next_session: null,
    completed_count: 0,
    ...overrides,
  };
}

test("no warning when there is no Current Protocol to supersede", () => {
  // Arrange: the Home empty state — nothing is Current.
  // Act
  const warning = supersedeWarning(null);
  // Assert: generating is silent; there is nothing to set aside.
  assert.equal(warning, null);
});

test("no warning when the Current Protocol has no performed Session yet", () => {
  // Arrange: a fresh (or Incomplete-only) Current Protocol — zero forward progress,
  // Next Session still at the start, nothing settled to lose (ADR-0037).
  const current = makeCurrent({ completed_count: 0 });
  // Act
  const warning = supersedeWarning(current);
  // Assert: superseding it is silent.
  assert.equal(warning, null);
});

test("warns and names the Protocol when it has a frozen performed prefix", () => {
  // Arrange: an in-progress Current Protocol — at least one performed Session, so
  // superseding it sets aside real progress the user can't return to (ADR-0037).
  const current = makeCurrent({
    completed_count: 3,
    name: "Summer Strength",
    label: "Summer Strength",
  });
  // Act
  const warning = supersedeWarning(current);
  // Assert: the user is warned, and the message names the Protocol being set aside
  // so they know what they're leaving behind. (Exact copy is not asserted — it's
  // wording, not behavior.)
  assert.notEqual(warning, null);
  assert.ok(warning?.includes("Summer Strength"));
});

test("warns using the derived label when the Protocol is unnamed", () => {
  // Arrange: an unnamed in-progress Protocol falls back to its derived
  // `objective · training_type` label (ADR-0021), never a blank name.
  const current = makeCurrent({
    completed_count: 1,
    name: null,
    label: "hypertrophy · strength",
  });
  // Act
  const warning = supersedeWarning(current);
  // Assert: the derived label carries the message.
  assert.ok(warning?.includes("hypertrophy · strength"));
});
