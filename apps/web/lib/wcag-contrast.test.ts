import { test } from "node:test";
import assert from "node:assert/strict";

import { contrastRatio, hexToRgb, relativeLuminance } from "./wcag-contrast.ts";

// Unit tests for the pure WCAG contrast math (ADR-0070). Anchored to values the
// WCAG spec fixes exactly (black/white = 21:1, identical colours = 1:1) plus a
// couple of hand-checked mid-tones, so a regression in the luminance formula is
// caught here rather than only via the Skin token guard.

test("black on white is the maximum 21:1", () => {
  // Arrange / Act
  const ratio = contrastRatio("#000000", "#ffffff");

  // Assert
  assert.ok(Math.abs(ratio - 21) < 0.01, `expected ~21, got ${ratio}`);
});

test("a colour against itself is exactly 1:1", () => {
  assert.equal(contrastRatio("#6f7d9c", "#6f7d9c"), 1);
});

test("is symmetric in foreground/background order", () => {
  const fgBg = contrastRatio("#525252", "#ffffff");
  const bgFg = contrastRatio("#ffffff", "#525252");

  assert.equal(fgBg, bgFg);
});

test("white has relative luminance 1 and black 0", () => {
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("#000000"), 0);
});

test("matches a hand-verified mid-tone ratio", () => {
  // #767676 on white is the canonical WCAG example that just clears AA (~4.54:1).
  const ratio = contrastRatio("#767676", "#ffffff");

  assert.ok(
    ratio > 4.5 && ratio < 4.6,
    `expected ~4.54, got ${ratio.toFixed(3)}`,
  );
});

test("expands 3-digit shorthand hex", () => {
  assert.deepEqual(hexToRgb("#fff"), [255, 255, 255]);
  assert.deepEqual(hexToRgb("#0a0"), [0, 170, 0]);
});

test("throws on a malformed hex string", () => {
  assert.throws(() => hexToRgb("#12345"), /not a 6-digit hex/);
  assert.throws(() => hexToRgb("nope"), /not a 6-digit hex/);
});
