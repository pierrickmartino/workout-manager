import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FONT_PRELOAD_EXEMPTIONS,
  findFontPreloadViolations,
  formatFontPreloadViolations,
  nextFontCalls,
  skinFontHandles,
} from "./font-preload-policy.ts";
import { DEFAULT_SKIN } from "./theme.ts";

const webRoot = resolve(import.meta.dirname, "..");
const LAYOUT = "app/layout.tsx";

const CSS = `
@theme {
  --color-base: #000;
  --font-display: var(--font-a), "A", system-ui, sans-serif;
  --font-sans: var(--font-a), "A", system-ui, sans-serif;
  --font-mono: var(--font-b), "B", ui-monospace, monospace;
}
@layer base {
  html[data-skin="other"] {
    --font-display: var(--font-c), "C", system-ui, sans-serif;
    --font-sans: var(--font-c), "C", system-ui, sans-serif;
    --font-mono: var(--font-d), "D", ui-monospace, monospace;
  }
}`;

const layout = (calls: string) => `
import { A_Font, B_Font, C_Font } from "next/font/google";
${calls}`;

test("reads a Skin's handles from its own block, else from the @theme defaults", () => {
  // Act / Assert
  assert.deepEqual([...skinFontHandles(CSS, "other")], ["--font-c", "--font-d"]);
  assert.deepEqual([...skinFontHandles(CSS, "pulse")], ["--font-a", "--font-b"]);
});

test("reads next/font calls with next/font's default preload", () => {
  // Arrange
  const source = layout(`
    const a = A_Font({ subsets: ["latin"], variable: "--font-a" });
    const c = C_Font({ subsets: ["latin"], variable: "--font-c", preload: false });
    const notAFont = somethingElse({ variable: "--font-z" });`);

  // Act
  const calls = nextFontCalls(source, LAYOUT);

  // Assert
  assert.deepEqual(calls.map(({ variable, preload }) => [variable, preload]), [
    ["--font-a", true],
    ["--font-c", false],
  ]);
});

test("accepts preload on the default Skin's families only", () => {
  // Arrange
  const calls = nextFontCalls(layout(`
    const a = A_Font({ variable: "--font-a" });
    const b = B_Font({ variable: "--font-b", preload: true });
    const c = C_Font({ variable: "--font-c", preload: false });`), LAYOUT);

  // Act / Assert
  assert.deepEqual(findFontPreloadViolations(calls, skinFontHandles(CSS, "pulse")), []);
});

test("reports a non-default family left on next/font's default preload", () => {
  // Arrange — the shape every Aurora and Vercel family had before ADR-0050's amendment
  const calls = nextFontCalls(layout(`
    const a = A_Font({ variable: "--font-a" });
    const b = B_Font({ variable: "--font-b" });
    const c = C_Font({ variable: "--font-c" });`), LAYOUT);

  // Act
  const violations = findFontPreloadViolations(calls, skinFontHandles(CSS, "pulse"));

  // Assert
  assert.equal(violations.length, 1);
  assert.match(formatFontPreloadViolations(violations, LAYOUT), /--font-c.*add `preload: false`/);
});

test("reports a default family that stopped preloading", () => {
  // Arrange — what changing DEFAULT_SKIN without moving the preloads would leave
  const calls = nextFontCalls(layout(`
    const a = A_Font({ variable: "--font-a" });
    const b = B_Font({ variable: "--font-b" });
    const c = C_Font({ variable: "--font-c", preload: false });`), LAYOUT);

  // Act
  const violations = findFontPreloadViolations(calls, skinFontHandles(CSS, "other"));

  // Assert — c must preload, a and b must not, and d is declared nowhere
  assert.equal(violations.length, 4);
  assert.match(violations.map(({ message }) => message).join("\n"), /--font-d.*no next\/font call/);
});

test("fails closed on options it cannot read", () => {
  // Arrange
  const calls = nextFontCalls(layout(`
    const a = A_Font({ variable: "--font-a", preload: shouldPreload });
    const b = B_Font({ variable: handle });`), LAYOUT);

  // Act
  const violations = findFontPreloadViolations(calls, new Set());

  // Assert
  assert.equal(violations.length, 2);
  assert.ok(violations.every(({ message }) => /must be literals/.test(message)));
});

test("the app layout preloads exactly the default Skin's fonts", () => {
  // Arrange
  const source = readFileSync(resolve(webRoot, LAYOUT), "utf8");
  const css = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");
  const calls = nextFontCalls(source, LAYOUT);
  const defaultHandles = skinFontHandles(css, DEFAULT_SKIN);

  // Act
  const violations = findFontPreloadViolations(calls, defaultHandles);

  // Assert — and the sweep really found the fonts, so an empty result means something
  assert.ok(calls.length > defaultHandles.size, "expected next/font calls in app/layout.tsx");
  assert.ok(defaultHandles.size > 0, `expected font tokens for ${DEFAULT_SKIN} in globals.css`);
  assert.equal(violations.length, 0, formatFontPreloadViolations(violations, LAYOUT));
});

test("the exemption registry is empty unless each entry gives a reason", () => {
  // Act / Assert
  assert.ok(FONT_PRELOAD_EXEMPTIONS.every(({ reason }) => reason.trim().length > 0));
});
