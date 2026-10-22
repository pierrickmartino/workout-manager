import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAvatarUniverseControl } from "./avatar-universe-control.ts";

// The admin Avatar Universe control's view-model (ADR-0137). Asserted on the returned option
// shapes, never on markup.

test("the control lists the three universes in order, by name", () => {
  // Act
  const control = buildAvatarUniverseControl("realm", "realm");

  // Assert
  assert.deepEqual(
    control.options.map((option) => [option.value, option.label]),
    [
      ["realm", "The Realm"],
      ["orbit", "Orbit"],
      ["olympus", "Olympus"],
    ],
  );
});

test("exactly the published universe is marked active", () => {
  // Act
  const control = buildAvatarUniverseControl("orbit", "orbit");

  // Assert
  assert.deepEqual(
    control.options.map((option) => option.isActive),
    [false, true, false],
  );
});

test("with nothing picked there is nothing to publish", () => {
  // Act
  const control = buildAvatarUniverseControl("orbit", "orbit");

  // Assert
  assert.equal(control.hasPendingPick, false);
});

test("picking another universe marks it apart from the active one, ready to publish", () => {
  // Act
  const control = buildAvatarUniverseControl("realm", "olympus");

  // Assert
  assert.equal(control.hasPendingPick, true);
  assert.deepEqual(
    control.options.map((option) => [option.value, option.isActive, option.isPicked]),
    [
      ["realm", true, false],
      ["orbit", false, false],
      ["olympus", false, true],
    ],
  );
});

test("each universe previews its whole cast, in catalog order", () => {
  // Act
  const olympus = buildAvatarUniverseControl("realm", "realm").options[2];

  // Assert
  assert.equal(olympus.cast.length, 8);
  assert.equal(olympus.cast[0].src, "/avatars/olympus/novice.webp");
  assert.equal(olympus.cast[7].src, "/avatars/olympus/titan.webp");
});
