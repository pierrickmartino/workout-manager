import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PERSISTENT_ELEMENTS,
  persistentTransitionStyle,
  type PersistentElement,
} from "./persistent-transition.ts";
import { findPersistentTransitionUses, findPinnedUnderBoundary, isolationGaps } from "./persistent-transition-policy.ts";
import { findStylesheetMotion } from "./view-transition-motion-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

function read(file: string): string {
  return readFileSync(resolve(webRoot, file), "utf8");
}

const NAV: PersistentElement = { name: "nav", hasBackdrop: false, tier: "chrome" };
const BLURRED: PersistentElement = { name: "bar", hasBackdrop: true, tier: "overlay" };

const ISOLATED = `
::view-transition-group(nav) { animation: none; z-index: 100; }
::view-transition-group(bar) { animation: none; z-index: 200; }
::view-transition-old(bar) { display: none; }
::view-transition-new(bar) { animation: none; }`;

// --- Isolation CSS ---------------------------------------------------------

test("accepts a stylesheet that pins every persistent element at its tier", () => {
  // Arrange & Act
  const gaps = isolationGaps(ISOLATED, [NAV, BLURRED]);
  // Assert
  assert.deepEqual(gaps, []);
});

test("reports a persistent element whose group still animates with the page", () => {
  // Arrange
  const css = ISOLATED.replace("::view-transition-group(nav) { animation: none; z-index: 100; }", "");
  // Act
  const gaps = isolationGaps(css, [NAV, BLURRED]);
  // Assert
  assert.deepEqual(gaps, [
    "::view-transition-group(nav) needs animation: none",
    "::view-transition-group(nav) needs z-index: 100",
  ]);
});

test("reports a group stacked at the wrong tier", () => {
  // Arrange: a toast under the chrome would slide behind the tab bar.
  const css = ISOLATED.replace("z-index: 200", "z-index: 100");
  // Act
  const gaps = isolationGaps(css, [NAV, BLURRED]);
  // Assert
  assert.deepEqual(gaps, ["::view-transition-group(bar) needs z-index: 200"]);
});

test("requires a blurred element to drop its old snapshot, which would bake the blur in", () => {
  // Arrange
  const css = ISOLATED
    .replace("::view-transition-old(bar) { display: none; }", "")
    .replace("::view-transition-new(bar) { animation: none; }", "");
  // Act
  const gaps = isolationGaps(css, [NAV, BLURRED]);
  // Assert
  assert.deepEqual(gaps, [
    "::view-transition-old(bar) needs display: none",
    "::view-transition-new(bar) needs animation: none",
  ]);
});

test("ignores isolation rules that only apply under a media query", () => {
  // Arrange: pinned on a phone only is not pinned.
  const css = `@media (min-width: 1024px) { ${ISOLATED} }`;
  // Act
  const gaps = isolationGaps(css, [NAV]);
  // Assert
  assert.equal(gaps.length, 2);
});

// --- Call sites ------------------------------------------------------------

test("finds each registry key a component pins with persistentTransitionStyle", () => {
  // Arrange
  const source = `export const A = () => <nav style={persistentTransitionStyle("sidebar")} />;`;
  // Act
  const uses = findPersistentTransitionUses(source, "a.tsx");
  // Assert
  assert.deepEqual(uses, [{ file: "a.tsx", line: 1, key: "sidebar" }]);
});

test("reports a hand-written view-transition name that bypasses the registry", () => {
  // Arrange
  const source = `export const A = () => (
  <nav style={{ viewTransitionName: "nav" }} className="[view-transition-name:x]" />
);`;
  // Act
  const uses = findPersistentTransitionUses(source, "a.tsx");
  // Assert
  assert.deepEqual(uses, [
    { file: "a.tsx", line: 2, key: null },
    { file: "a.tsx", line: 2, key: null },
  ]);
});

test("returns the style object a pinned element spreads", () => {
  // Arrange & Act
  const style = persistentTransitionStyle("header");
  // Assert
  assert.deepEqual(style, { viewTransitionName: PERSISTENT_ELEMENTS.header.name });
});

// --- The app's own sources -------------------------------------------------

test("the app stylesheet pins every persistent element", () => {
  // Arrange & Act
  const gaps = isolationGaps(read("app/globals.css"), Object.values(PERSISTENT_ELEMENTS));
  // Assert
  assert.deepEqual(gaps, []);
});

test("the isolation rules move nothing the reduced-motion guard would object to", () => {
  // Arrange & Act
  const violations = findStylesheetMotion(read("app/globals.css"), "app/globals.css");
  // Assert
  assert.deepEqual(violations, []);
});

test("every persistent element is pinned by exactly one component, through the registry", () => {
  // Arrange
  const uses = componentSources().flatMap((file) => findPersistentTransitionUses(read(file), file));
  // Act
  const bypasses = uses.filter(({ key }) => key === null);
  const filesByKey = Object.keys(PERSISTENT_ELEMENTS).map((key) =>
    [key, uses.filter((use) => use.key === key).map(({ file }) => file)] as const);
  // Assert: a name rendered twice makes the browser skip the whole transition.
  assert.deepEqual(bypasses, [], "a view-transition name was written by hand; add it to PERSISTENT_ELEMENTS");
  for (const [key, files] of filesByKey) {
    assert.equal(files.length, 1, `${key} is pinned ${files.length} times: ${files.join(", ")}`);
  }
});

test("the registry's backdrop flag matches whether the pinned component blurs", () => {
  // Arrange
  const uses = componentSources().flatMap((file) => findPersistentTransitionUses(read(file), file));
  // Act & Assert: a blur added later needs the old snapshot dropped, so the flag must follow it.
  for (const { key, file } of uses) {
    if (key === null) continue;
    const blurs = /\bbackdrop-blur\b/.test(read(file));
    assert.equal(PERSISTENT_ELEMENTS[key].hasBackdrop, blurs, `${key} (${file}): hasBackdrop should be ${blurs}`);
  }
});

test("every persistent element has a distinct name", () => {
  // Arrange & Act
  const names = Object.values(PERSISTENT_ELEMENTS).map(({ name }) => name);
  // Assert
  assert.equal(new Set(names).size, names.length);
});

test("reports a pinned element that is a boundary's own root, whose name React would override", () => {
  // Arrange: React names a boundary's top DOM node itself while it animates (ADR-0124).
  const source = `export const A = ({ show }) => (
  <div style={persistentTransitionStyle("syncToast")}>
    {show ? (
      <ViewTransition enter="toast-in" default="none">
        <p style={persistentTransitionStyle("header")} />
      </ViewTransition>
    ) : null}
  </div>
);`;
  // Act
  const found = findPinnedUnderBoundary(source, "a.tsx");
  // Assert: the outer pin wraps the boundary, which is fine; the inner one is its root.
  assert.deepEqual(found, [{ file: "a.tsx", line: 5, key: "header" }]);
});

test("no persistent element is the root of a ViewTransition", () => {
  // Arrange & Act
  const found = componentSources().flatMap((file) => findPinnedUnderBoundary(read(file), file));
  // Assert
  assert.deepEqual(found, []);
});
