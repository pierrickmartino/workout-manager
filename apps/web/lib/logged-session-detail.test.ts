import { test } from "node:test";
import assert from "node:assert/strict";

import { loggedSessionDetail } from "./logged-session-detail.ts";
import type { LoggedSession } from "./logs-types.ts";

// `loggedSessionDetail` decides what the record detail page offers, keyed off the plan/record
// boundary: a plan-backed record duplicates its plan and links back to it; a plan-less record
// offers Capture into a new reusable plan (ADR-0043/0044). The two are mutually exclusive.

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

test("a plan-backed record duplicates its plan and links back to it", () => {
  // Arrange
  const detail = loggedSessionDetail(record({ id: 7, session_id: 42 }));

  // Assert — Duplicate is offered, Capture is not; the source plan is linked
  assert.equal(detail.isPlanBacked, true);
  assert.equal(detail.canDuplicate, true);
  assert.equal(detail.sourceSessionId, 42);
  assert.equal(detail.sourceSessionHref, "/sessions/42");
  assert.equal(detail.canCapture, false);
});

test("a plan-less record offers Capture and has no source plan", () => {
  // Arrange
  const detail = loggedSessionDetail(record({ id: 7, session_id: null }));

  // Assert — Capture is offered, Duplicate is not; no plan to link
  assert.equal(detail.isPlanBacked, false);
  assert.equal(detail.canCapture, true);
  assert.equal(detail.captureHref, "/history/7/capture");
  assert.equal(detail.canDuplicate, false);
  assert.equal(detail.sourceSessionHref, null);
  assert.equal(detail.sourceSessionId, null);
});

test("always points at the record's own correction form", () => {
  const detail = loggedSessionDetail(record({ id: 99 }));
  assert.equal(detail.editHref, "/history/99/edit");
});

test("formats a measured Session Duration, and leaves an unmeasured one null", () => {
  assert.equal(loggedSessionDetail(record({ duration_seconds: 750 })).durationLabel, "12:30");
  assert.equal(loggedSessionDetail(record({ duration_seconds: 5 })).durationLabel, "0:05");
  assert.equal(loggedSessionDetail(record({ duration_seconds: 3661 })).durationLabel, "1:01:01");
  assert.equal(loggedSessionDetail(record({ duration_seconds: null })).durationLabel, null);
});
