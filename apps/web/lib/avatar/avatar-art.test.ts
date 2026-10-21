import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AVATAR_ART, DEFAULT_AVATAR_ID, headerAvatar } from "./avatar-art.ts";

// `avatar-art` holds the hand-made artwork for each catalog Avatar (ADR-0136) and resolves
// which one the header shows. Asserted on the resolved id and the art's declared structure,
// never on markup or pixels.

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "manifest.json");

function manifestIds(): readonly string[] {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).avatars;
}

test("the header shows the user’s stored Avatar", () => {
  // Arrange & Act
  const avatar = headerAvatar("elf-ranger");

  // Assert
  assert.equal(avatar.id, "elf-ranger");
});

test("the header falls back to the Novice for a missing or unknown Avatar", () => {
  // Arrange & Act
  const missing = headerAvatar(undefined);
  const unknown = headerAvatar("retired-hero");

  // Assert
  assert.equal(DEFAULT_AVATAR_ID, "novice");
  assert.equal(missing.id, "novice");
  assert.equal(unknown.id, "novice");
});

test("an inherited object key is not an Avatar", () => {
  // Arrange & Act
  const avatar = headerAvatar("constructor");

  // Assert
  assert.equal(avatar.id, "novice");
});

test("the committed manifest lists exactly the artwork ids, in order", () => {
  // Arrange & Act
  const artIds = Object.keys(AVATAR_ART);

  // Assert — the API-side contract test holds the same manifest to the backend catalog
  assert.deepEqual(manifestIds(), artIds);
  assert.deepEqual(artIds, [
    "novice",
    "dwarf-lifter",
    "elf-ranger",
    "monk",
    "barbarian",
    "valkyrie",
    "paladin",
    "titan",
  ]);
});

test("every Avatar is drawn from shapes in its own artwork", () => {
  for (const [id, art] of Object.entries(AVATAR_ART)) {
    // Assert
    assert.equal(art.id, id);
    assert.ok(art.shapes.length > 0, `${id} has no shapes`);
    for (const shape of art.shapes) {
      assert.match(shape.d, /^M/, `${id} has a shape that is not a path`);
    }
  }
});
