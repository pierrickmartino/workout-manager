import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AVATAR_IDS,
  AVATAR_UNIVERSES,
  DEFAULT_AVATAR_ID,
  DEFAULT_AVATAR_UNIVERSE,
  avatarArt,
  isAvatarUniverse,
} from "./avatar-art.ts";

// `avatar-art` resolves which portrait draws a catalog Avatar in an Avatar Universe (ADR-0136,
// ADR-0137). Asserted on the resolved art and the committed files, never on pixels.

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const PUBLIC_DIR = join(HERE, "..", "..", "public");

function manifest(): { avatars: readonly string[]; universes: readonly string[] } {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

test("an Avatar is drawn from its portrait in the given universe", () => {
  // Act
  const art = avatarArt("elf-ranger", "orbit");

  // Assert
  assert.equal(art.id, "elf-ranger");
  assert.equal(art.universe, "orbit");
  assert.equal(art.src, "/avatars/orbit/elf-ranger.webp");
});

test("a missing or unknown Avatar falls back to the Novice", () => {
  // Act
  const missing = avatarArt(undefined, "realm");
  const unknown = avatarArt("retired-hero", "realm");

  // Assert
  assert.equal(DEFAULT_AVATAR_ID, "novice");
  assert.equal(missing.id, "novice");
  assert.equal(unknown.src, "/avatars/realm/novice.webp");
});

test("a missing or unknown universe falls back to The Realm", () => {
  // Act
  const missing = avatarArt("monk", undefined);
  const unknown = avatarArt("monk", "atlantis");

  // Assert
  assert.equal(DEFAULT_AVATAR_UNIVERSE, "realm");
  assert.equal(missing.src, "/avatars/realm/monk.webp");
  assert.equal(unknown.universe, "realm");
});

test("an inherited object key is neither an Avatar nor a universe", () => {
  // Act
  const art = avatarArt("constructor", "toString");

  // Assert
  assert.equal(art.id, "novice");
  assert.equal(art.universe, "realm");
  assert.equal(isAvatarUniverse("constructor"), false);
});

test("an Avatar keeps the same accent ring in every universe", () => {
  // Act
  const accents = AVATAR_UNIVERSES.map((universe) => avatarArt("valkyrie", universe).accent);

  // Assert
  assert.deepEqual(accents, ["blue", "blue", "blue"]);
});

test("the committed manifest lists exactly the ids and universes, in order", () => {
  // Act
  const { avatars, universes } = manifest();

  // Assert — the API-side contract test holds the same manifest to the backend catalog
  assert.deepEqual(avatars, [...AVATAR_IDS]);
  assert.deepEqual(universes, [...AVATAR_UNIVERSES]);
  assert.deepEqual(universes, ["realm", "orbit", "olympus"]);
});

test("every universe has a portrait file for every Avatar", () => {
  for (const universe of AVATAR_UNIVERSES) {
    for (const id of AVATAR_IDS) {
      // Arrange
      const file = join(PUBLIC_DIR, avatarArt(id, universe).src);

      // Assert — a missing or empty file would render a broken image in the header
      assert.ok(existsSync(file), `missing portrait ${file}`);
      assert.ok(statSync(file).size > 0, `empty portrait ${file}`);
    }
  }
});
