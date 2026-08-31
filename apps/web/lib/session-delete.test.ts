import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DELETE_DISABLED_HINT,
  loggedCountBadge,
  sessionDeleteView,
} from "./session-delete.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// `sessionDeleteView` turns a Session into the detail page's Delete state (show / canDelete /
// loggedCount) and `loggedCountBadge` the My Sessions row label. Pure and server-free, so the
// deletable-only-when-unperformed rule (CONTEXT: Delete, ADR-0063) is unit-tested here.

function makeSession(overrides: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: 1,
    clerk_user_id: "user_a",
    training_type: "strength",
    duration_minutes: 45,
    has_been_regenerated: false,
    prescriptions: [],
    ...overrides,
  };
}

test("offers delete on a standalone Session with no logged training", () => {
  const session = makeSession({ logged_count: 0, is_protocol_member: false });

  const view = sessionDeleteView(session);

  assert.deepEqual(view, { show: true, canDelete: true, loggedCount: 0 });
});

test("shows delete disabled when the Session has logged training", () => {
  const session = makeSession({ logged_count: 3, is_protocol_member: false });

  const view = sessionDeleteView(session);

  assert.deepEqual(view, { show: true, canDelete: false, loggedCount: 3 });
});

test("hides delete on a Protocol member (standalone-only)", () => {
  // A Protocol member carries a count but is never deleted here.
  const session = makeSession({ logged_count: 0, is_protocol_member: true });

  const view = sessionDeleteView(session);

  assert.equal(view.show, false);
  assert.equal(view.canDelete, false);
});

test("hides delete when a read omits the Logged Count", () => {
  // A read path that carries no count (e.g. live hydration) can't decide deletability.
  const session = makeSession({ logged_count: undefined });

  const view = sessionDeleteView(session);

  assert.deepEqual(view, { show: false, canDelete: false, loggedCount: 0 });
});

test("the disabled hint states why a performed session can't be deleted", () => {
  assert.match(DELETE_DISABLED_HINT, /logged training/);
});

test("badges the Logged Count only when the Session has been performed", () => {
  assert.equal(loggedCountBadge(0), null);
  assert.equal(loggedCountBadge(1), "1 logged");
  assert.equal(loggedCountBadge(5), "5 logged");
});
