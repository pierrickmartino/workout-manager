import { test } from "node:test";
import assert from "node:assert/strict";

import { GENERIC_AUTHOR_LABEL, sessionAuthorView } from "./session-author.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// `sessionAuthorView` turns a Session into the Session view's Author line: the "by <name>"
// byline, the resolved name, and whether it is a real name or the generic fallback. Pure and
// server-free, so the author-display fallback (CONTEXT: Author, #395) is unit-tested here and
// the page stays thin.

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

test("credits the Author by display name when set", () => {
  // Arrange — a Session whose Author carries a resolved display name
  const session = makeSession({
    author: { display_name: "Alex Rivera" },
  });

  // Act
  const view = sessionAuthorView(session);

  // Assert
  assert.deepEqual(view, {
    byline: "by Alex Rivera",
    displayName: "Alex Rivera",
    isNamed: true,
    // No `authored_by_me` on this Session, so the byline is not self-authored — show it.
    showByline: true,
  });
});

test("hides the byline when the viewer is the Author (authored_by_me)", () => {
  // Arrange — a plan the viewer created themselves: crediting them is pure repetition
  const session = makeSession({
    author: { display_name: "Pierrick" },
    authored_by_me: true,
  });

  // Act
  const view = sessionAuthorView(session);

  // Assert — the byline is suppressed; the resolved name is still available to callers
  assert.equal(view.showByline, false);
  assert.equal(view.byline, "by Pierrick");
  assert.equal(view.displayName, "Pierrick");
});

test("shows the byline when the Author is someone else (adopted / shared)", () => {
  // Arrange — an adopted copy keeps its original Author, so the byline carries provenance
  const session = makeSession({
    author: { display_name: "Alex Rivera" },
    authored_by_me: false,
  });

  // Act
  const view = sessionAuthorView(session);

  // Assert
  assert.equal(view.showByline, true);
});

test("shows the byline when a read omits authored_by_me (safe default)", () => {
  // Arrange — a read path that carries no self-authorship signal at all
  const session = makeSession({ author: { display_name: "Sam" } });

  // Act
  const view = sessionAuthorView(session);

  // Assert — absence of the flag never hides provenance
  assert.equal(view.showByline, true);
});

test("falls back to the generic label when the display name is blank", () => {
  // Arrange — an Author with no usable name (blank/whitespace)
  const session = makeSession({
    author: { display_name: "   " },
  });

  // Act
  const view = sessionAuthorView(session);

  // Assert — never blank: credited generically, flagged as not a real name
  assert.equal(view.displayName, GENERIC_AUTHOR_LABEL);
  assert.equal(view.byline, `by ${GENERIC_AUTHOR_LABEL}`);
  assert.equal(view.isNamed, false);
});

test("falls back to the generic label when a read omits the author", () => {
  // Arrange — a read path (e.g. live hydration) that carries no author at all
  const session = makeSession({ author: undefined });

  // Act
  const view = sessionAuthorView(session);

  // Assert — still renders a byline rather than nothing
  assert.equal(view.displayName, GENERIC_AUTHOR_LABEL);
  assert.equal(view.isNamed, false);
});

test("trims surrounding whitespace from a real name", () => {
  // Arrange
  const session = makeSession({
    author: { display_name: "  Sam  " },
  });

  // Act
  const view = sessionAuthorView(session);

  // Assert
  assert.equal(view.displayName, "Sam");
  assert.equal(view.byline, "by Sam");
  assert.equal(view.isNamed, true);
});
