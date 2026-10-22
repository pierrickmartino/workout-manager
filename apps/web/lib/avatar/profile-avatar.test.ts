import { test } from "node:test";
import assert from "node:assert/strict";

import type { AvatarCatalog } from "./avatar-picker.ts";
import { profileAvatar } from "./profile-avatar.ts";

// Profile's Avatar (ADR-0136): the user's stored Avatar resolved to its artwork and the
// character name the GET /api/avatars catalog gives it. Asserted on the returned shape,
// never on markup.

const CATALOG: AvatarCatalog = {
  operator_level: 1,
  universe: "realm",
  avatars: [
    { id: "novice", name: "Novice", unlock_level: 1, unlocked: true, current_level: 1 },
    { id: "dwarf-lifter", name: "Dwarf Lifter", unlock_level: 1, unlocked: true, current_level: 1 },
    { id: "elf-ranger", name: "Elf Ranger", unlock_level: 1, unlocked: true, current_level: 1 },
  ],
};

test("Profile shows the user’s stored Avatar with its character name", () => {
  // Act
  const avatar = profileAvatar("dwarf-lifter", CATALOG, "realm");

  // Assert
  assert.equal(avatar.art.id, "dwarf-lifter");
  assert.equal(avatar.name, "Dwarf Lifter");
});

test("Profile falls back to the Novice for a missing or unknown Avatar, as the header does", () => {
  // Act
  const missing = profileAvatar(undefined, CATALOG, "realm");
  const unknown = profileAvatar("retired-hero", CATALOG, "realm");

  // Assert
  assert.deepEqual([missing.art.id, missing.name], ["novice", "Novice"]);
  assert.deepEqual([unknown.art.id, unknown.name], ["novice", "Novice"]);
});

test("an Avatar the catalog does not name is still drawn as the header draws it, unnamed", () => {
  // Arrange — a catalog that has retired the Elf Ranger
  const catalog: AvatarCatalog = {
    ...CATALOG,
    avatars: CATALOG.avatars.filter((entry) => entry.id !== "elf-ranger"),
  };

  // Act
  const avatar = profileAvatar("elf-ranger", catalog, "realm");

  // Assert — the art matches the header's; no name is invented for it
  assert.deepEqual([avatar.art.id, avatar.name], ["elf-ranger", null]);
});

test("without the catalog Profile still draws the Avatar, with no name to show", () => {
  // Act
  const avatar = profileAvatar("elf-ranger", null, "realm");

  // Assert
  assert.equal(avatar.art.id, "elf-ranger");
  assert.equal(avatar.name, null);
});

test("Profile draws the Avatar in the universe its catalog names it in", () => {
  // Arrange — Orbit is published; the caller's fallback is never needed
  const orbit: AvatarCatalog = {
    ...CATALOG,
    universe: "orbit",
    avatars: [{ id: "monk", name: "Zero-G Adept", unlock_level: 3, unlocked: true, current_level: 3 }],
  };

  // Act
  const avatar = profileAvatar("monk", orbit, "realm");

  // Assert
  assert.equal(avatar.art.src, "/avatars/orbit/monk.webp");
  assert.equal(avatar.name, "Zero-G Adept");
});

test("without the catalog Profile draws the Avatar in the header’s universe", () => {
  // Act
  const avatar = profileAvatar("monk", null, "olympus");

  // Assert
  assert.equal(avatar.art.src, "/avatars/olympus/monk.webp");
  assert.equal(avatar.name, null);
});
