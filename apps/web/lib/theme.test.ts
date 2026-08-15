import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MODE,
  DEFAULT_SKIN,
  resolveTheme,
  type ThemeAttributes,
} from "./theme.ts";

// `resolveTheme` is the single seam the layout uses to turn an Active Skin + a
// user's Mode into the `data-skin` / `data-mode` attributes stamped on <html>.
// It is pure (no I/O), so the Mode slice (#330) and Active Skin slice (#331) can
// both feed it without colliding in the layout. The CSS in globals.css keys the
// PULSE token variants off exactly these attributes.

test("Dark Mode stamps an explicit data-mode='dark'", () => {
  // Arrange / Act
  const attrs = resolveTheme("pulse", "dark");

  // Assert — dark is stamped, never left to the CSS fallback
  assert.deepEqual(attrs, { "data-skin": "pulse", "data-mode": "dark" });
});

test("Light Mode stamps an explicit data-mode='light'", () => {
  assert.deepEqual(resolveTheme("pulse", "light"), {
    "data-skin": "pulse",
    "data-mode": "light",
  });
});

test("System Mode omits data-mode so the prefers-color-scheme fallback decides", () => {
  // Arrange / Act — System is resolved by the device, not the server
  const attrs = resolveTheme("pulse", "system");

  // Assert — only the Skin is stamped; no data-mode key at all
  assert.deepEqual(attrs, { "data-skin": "pulse" });
  assert.equal("data-mode" in attrs, false);
});

test("carries the Active Skin through unchanged", () => {
  // Arrange — a future Skin from the catalog (#331) still resolves the same way
  const attrs = resolveTheme("pulse", "light");

  // Assert — the Skin half is passed straight through to data-skin
  assert.equal(attrs["data-skin"], "pulse");
});

test("defaults preserve today's all-dark PULSE experience", () => {
  // Assert — the shipped defaults are the PULSE Skin at Dark Mode
  assert.equal(DEFAULT_SKIN, "pulse");
  assert.equal(DEFAULT_MODE, "dark");

  const attrs: ThemeAttributes = resolveTheme(DEFAULT_SKIN, DEFAULT_MODE);
  assert.deepEqual(attrs, { "data-skin": "pulse", "data-mode": "dark" });
});
