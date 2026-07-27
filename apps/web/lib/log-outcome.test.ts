import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateUncomplete } from "./log-outcome.ts";
import type { LoggedSession } from "./logs-types";

// A minimal Logged Session for the un-complete mirror: only id, session_id, and the
// Completion Outcome drive the rule, so the other fields carry inert defaults.
function record(overrides: Partial<LoggedSession> = {}): LoggedSession {
  return {
    id: 1,
    clerk_user_id: "user_owner",
    session_id: 10,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: "completed",
    duration_seconds: null,
    logged_sets: [],
    ...overrides,
  };
}

test("blocks un-completing a mid-protocol session when a later one is performed", () => {
  // Arrange — protocol order [10, 11, 12]; sessions 10 and 11 performed
  const target = record({ id: 1, session_id: 10 });
  const history = [target, record({ id: 2, session_id: 11 })];

  // Act
  const verdict = evaluateUncomplete(target, history, [[10, 11, 12]]);

  // Assert — the server would 409, so the un-complete affordance is disabled
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason ?? "", /gap|later|un-complet/i);
});

test("allows un-completing a mid-protocol session when no later one is performed", () => {
  const target = record({ id: 1, session_id: 10 });
  const history = [target];

  const verdict = evaluateUncomplete(target, history, [[10, 11, 12]]);

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, null);
});

test("allows un-completing the last-performed session", () => {
  const target = record({ id: 3, session_id: 12 });
  const history = [
    record({ id: 1, session_id: 10 }),
    record({ id: 2, session_id: 11 }),
    target,
  ];

  const verdict = evaluateUncomplete(target, history, [[10, 11, 12]]);

  assert.equal(verdict.allowed, true);
});

test("allows un-completing a standalone session that is in no protocol", () => {
  const target = record({ id: 1, session_id: 99 });
  const history = [target];

  const verdict = evaluateUncomplete(target, history, [[10, 11, 12]]);

  assert.equal(verdict.allowed, true);
});

test("allows un-completing when another advancing log keeps the session performed", () => {
  // Arrange — session 10 performed twice; a later session 11 is also performed
  const target = record({ id: 1, session_id: 10 });
  const history = [
    target,
    record({ id: 2, session_id: 10 }),
    record({ id: 3, session_id: 11 }),
  ];

  const verdict = evaluateUncomplete(target, history, [[10, 11]]);

  // Un-completing one of the two logs leaves session 10 performed — no hole opens
  assert.equal(verdict.allowed, true);
});
