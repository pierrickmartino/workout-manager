import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseColorBlocks } from "./skin-contrast-matrix.ts";
import { KNOWN_SKINS } from "./theme.ts";
import { SKIN_BASE_COLORS, themeColorFor } from "./theme-color.ts";

// ADR-0102: the registry restates `--color-base`, so the test holds it against the
// authored stylesheet rather than against itself.
const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// `--color-base` as the stylesheet declares it, per Skin × polarity. The dark block of a
// non-default Skin covers both `[data-mode="dark"]` and the unstamped System selector;
// `isSystem` marks the extra copy inside the `prefers-color-scheme: light` media query,
// which is the branch System Mode's light colour must match.
function declaredBase(skin: string, mode: "light" | "dark", isSystem: boolean): string {
  const blocks = parseColorBlocks(CSS).filter((block) =>
    block.skin === skin && block.mode === mode && block.isSystem === isSystem);
  assert.equal(blocks.length, 1,
    `expected exactly one ${skin} ${mode}${isSystem ? " (System)" : ""} block, saw ${blocks.length}`);
  return blocks[0].colors.get("base")!;
}

test("the registry states a page colour for every Skin and for nothing else", () => {
  // Arrange & Act & Assert — a missing Skin is a compile error under
  // `Record<Skin, …>`, so what is left to catch is a *stale* key: a Skin retired from
  // the catalog whose chrome colour stayed behind.
  assert.deepEqual(Object.keys(SKIN_BASE_COLORS).sort(), [...KNOWN_SKINS].sort());
});

test("each stated page colour is the one the stylesheet paints the page with", () => {
  // Arrange
  const drift: string[] = [];

  // Act
  for (const skin of KNOWN_SKINS) {
    for (const mode of ["dark", "light"] as const) {
      const declared = declaredBase(skin, mode, false);
      if (declared !== SKIN_BASE_COLORS[skin][mode]) {
        drift.push(`${skin} ${mode}: globals.css says ${declared}, SKIN_BASE_COLORS says ${SKIN_BASE_COLORS[skin][mode]}`);
      }
    }
  }

  // Assert
  assert.deepEqual(drift, [], `theme-color drift (ADR-0102):\n${drift.join("\n")}`);
});

test("a stamped Mode resolves to the one colour the page is painted", () => {
  // Arrange & Act & Assert
  assert.equal(themeColorFor("pulse", "dark"), "#09090b");
  assert.equal(themeColorFor("vercel", "dark"), "#000000");
  assert.equal(themeColorFor("clay", "light"), "#f8f1e9");
});

test("System Mode defers to the device, in both branches the stylesheet declares", () => {
  // Arrange — System stamps no `data-mode`, so the page colour is decided by
  // prefers-color-scheme and the chrome has to be decided the same way.
  const descriptors = themeColorFor("track", "system");

  // Act / Assert
  assert.deepEqual(descriptors, [
    { media: "(prefers-color-scheme: dark)", color: declaredBase("track", "dark", false) },
    { media: "(prefers-color-scheme: light)", color: declaredBase("track", "light", true) },
  ]);
});

test("every Skin's System pair matches the two blocks a device would resolve", () => {
  // Arrange
  const drift: string[] = [];

  // Act
  for (const skin of KNOWN_SKINS) {
    const descriptors = themeColorFor(skin, "system");
    assert.ok(Array.isArray(descriptors), `${skin} System should emit both branches`);
    const [dark, light] = descriptors;
    // The unstamped dark branch is the Skin's dark block; the light branch is its System
    // copy inside the media query, which globals.css restates because CSS cannot share a
    // block across `@media`.
    if (dark.color !== declaredBase(skin, "dark", false)) drift.push(`${skin} System dark: ${dark.color}`);
    if (light.color !== declaredBase(skin, "light", true)) drift.push(`${skin} System light: ${light.color}`);
  }

  // Assert
  assert.deepEqual(drift, [], `System-Mode theme-color drift (ADR-0102):\n${drift.join("\n")}`);
});

test("an unknown Skin falls back to the shipped one rather than to no colour", () => {
  // Arrange — the wire carries a bare id and `isSkin` narrows it, so this is the
  // defensive tail of that boundary (as `resolveActiveSkin` is).
  const colour = themeColorFor("sepia" as never, "dark");

  // Act / Assert
  assert.equal(colour, SKIN_BASE_COLORS.pulse.dark);
});
