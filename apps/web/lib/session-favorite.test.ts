import { test } from "node:test";
import assert from "node:assert/strict";

import { sessionFavoriteView } from "./session-favorite.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// `sessionFavoriteView` turns a Session into the Session view's Favorite state: whether it is
// currently favorited and whether the toggle should render at all. Pure and server-free, so the
// standalone-only show/hide rule (CONTEXT: Favorite, #396) is unit-tested here and the page stays
// thin.

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

test("shows the toggle favorited when the marker is true", () => {
  // Arrange — a standalone Session the owner has favorited
  const session = makeSession({ is_favorite: true });

  // Act
  const view = sessionFavoriteView(session);

  // Assert
  assert.deepEqual(view, { isFavorite: true, show: true });
});

test("shows the toggle un-favorited when the marker is false", () => {
  // Arrange — a standalone Session not yet favorited
  const session = makeSession({ is_favorite: false });

  // Act
  const view = sessionFavoriteView(session);

  // Assert
  assert.deepEqual(view, { isFavorite: false, show: true });
});

test("hides the toggle when the marker is withheld on a Protocol member", () => {
  // Arrange — a Protocol member: the server sends `null` (Favorite is standalone-only)
  const session = makeSession({ is_favorite: null });

  // Act
  const view = sessionFavoriteView(session);

  // Assert — hidden, and reads as not favorited
  assert.deepEqual(view, { isFavorite: false, show: false });
});

test("hides the toggle when a read omits the marker", () => {
  // Arrange — a read path (e.g. live hydration) that carries no favorite at all
  const session = makeSession({ is_favorite: undefined });

  // Act
  const view = sessionFavoriteView(session);

  // Assert
  assert.deepEqual(view, { isFavorite: false, show: false });
});
