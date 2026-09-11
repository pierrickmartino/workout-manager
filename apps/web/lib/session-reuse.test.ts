import { test } from "node:test";
import assert from "node:assert/strict";

import { sessionReuse } from "./session-reuse.ts";
import { loggedSessionDetail } from "./logged-session-detail.ts";
import type { LoggedSession } from "./logs-types.ts";

// `sessionReuse` is the single source of truth for a record's reuse affordance, keyed off the
// plan/record boundary (ADR-0031/0044): a plan-backed record (it has a `session_id`) Repeats
// its existing plan (Q9) — no copy — while a plan-less record offers Capture into a new
// reusable plan (ADR-0044). The two are mutually exclusive. Both the History row and the
// record detail page consume this, so they can never disagree.

function record(overrides: Partial<LoggedSession>): LoggedSession {
  return {
    id: 7,
    clerk_user_id: "u1",
    session_id: null,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: null,
    duration_seconds: null,
    logged_sets: [],
    ...overrides,
  };
}

test("a plan-backed record can Repeat its existing plan and cannot Capture", () => {
  // Arrange / Act
  const reuse = sessionReuse(record({ id: 7, session_id: 42 }));

  // Assert
  assert.equal(reuse.isPlanBacked, true);
  assert.equal(reuse.canRepeat, true);
  assert.equal(reuse.repeatHref, "/sessions/42");
  assert.equal(reuse.canCapture, false);
});

test("a plan-less record can Capture into a new plan and cannot Repeat", () => {
  // Arrange / Act
  const reuse = sessionReuse(record({ id: 7, session_id: null }));

  // Assert
  assert.equal(reuse.isPlanBacked, false);
  assert.equal(reuse.canCapture, true);
  assert.equal(reuse.captureHref, "/history/7/capture");
  assert.equal(reuse.canRepeat, false);
  assert.equal(reuse.repeatHref, null);
});

test("Repeat and Capture are mutually exclusive for any record", () => {
  const backed = sessionReuse(record({ session_id: 3 }));
  const adhoc = sessionReuse(record({ session_id: null }));

  // Exactly one action is offered in each case.
  assert.equal(backed.canRepeat, true);
  assert.equal(backed.canCapture, false);
  assert.equal(adhoc.canRepeat, false);
  assert.equal(adhoc.canCapture, true);
});

test("the Capture href keys off the record's own id, not the plan", () => {
  assert.equal(sessionReuse(record({ id: 99, session_id: null })).captureHref, "/history/99/capture");
});

test("the record detail page derives the same reuse affordance as the shared view-model", () => {
  // The whole point of extracting this seam: the row and the detail page can never disagree.
  for (const sample of [record({ id: 7, session_id: 42 }), record({ id: 8, session_id: null })]) {
    const reuse = sessionReuse(sample);
    const detail = loggedSessionDetail(sample);

    assert.equal(detail.isPlanBacked, reuse.isPlanBacked);
    assert.equal(detail.canRepeat, reuse.canRepeat);
    assert.equal(detail.repeatHref, reuse.repeatHref);
    assert.equal(detail.canCapture, reuse.canCapture);
    assert.equal(detail.captureHref, reuse.captureHref);
  }
});
