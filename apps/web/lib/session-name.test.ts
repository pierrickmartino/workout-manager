import { test } from "node:test";
import assert from "node:assert/strict";

import { sessionNameView } from "./session-name.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// `sessionNameView` turns a Session into the rename control's view: the display name (the
// user-given Session Name when set, else the server's derived fallback), whether the user
// has named it, and the value to seed the rename editor. Pure and server-free, so the
// name/fallback decision is unit-tested here and the page/component stay thin.

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

test("uses the user-given Session Name when set", () => {
  // Arrange — a named Session
  const session = makeSession({
    name: "Leg Day A",
    display_name: "Leg Day A",
  });

  // Act
  const view = sessionNameView(session);

  // Assert — the name is the display label, and the editor seeds with it
  assert.deepEqual(view, {
    displayName: "Leg Day A",
    isUserNamed: true,
    editValue: "Leg Day A",
  });
});

test("falls back to the derived label when unnamed", () => {
  // Arrange — a born-unnamed Session carrying the server's derived fallback
  const session = makeSession({
    name: null,
    display_name: "strength · 2026-08-25",
  });

  // Act
  const view = sessionNameView(session);

  // Assert — the fallback shows, flagged as not user-named, and the editor opens empty
  assert.deepEqual(view, {
    displayName: "strength · 2026-08-25",
    isUserNamed: false,
    editValue: "",
  });
});

test("treats a whitespace-only name as unnamed", () => {
  // Arrange
  const session = makeSession({
    name: "   ",
    display_name: "strength · 2026-08-25",
  });

  // Act
  const view = sessionNameView(session);

  // Assert — whitespace is not a real name
  assert.equal(view.isUserNamed, false);
  assert.equal(view.displayName, "strength · 2026-08-25");
  assert.equal(view.editValue, "");
});

test("trims surrounding whitespace from a real name", () => {
  // Arrange
  const session = makeSession({ name: "  Push Day  ", display_name: "Push Day" });

  // Act
  const view = sessionNameView(session);

  // Assert
  assert.equal(view.displayName, "Push Day");
  assert.equal(view.editValue, "Push Day");
});

test("falls back to the bare training type when a read omits display_name", () => {
  // Arrange — a read path that carries no name and no derived label
  const session = makeSession({ name: undefined, display_name: undefined });

  // Act
  const view = sessionNameView(session);

  // Assert — never blank: the training type stands in
  assert.equal(view.displayName, "strength");
  assert.equal(view.isUserNamed, false);
});
