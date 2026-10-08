import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BOUNDARY_EXEMPTIONS,
  findBoundaryViolations,
  findTransitionClasses,
  liveRootGaps,
  undeclaredTransitionClasses,
} from "./view-transition-boundary-policy.ts";

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

const LIVE_ROOT = `
::view-transition-old(root) { display: none; }
::view-transition-new(root) { animation: none; }`;

// --- default="none" and share ----------------------------------------------

test("accepts a named boundary that is off by default and opts into its morph", () => {
  // Arrange
  const source = `import { ViewTransition } from "react";
export const A = ({ id }) => <ViewTransition name={\`s-\${id}\`} share="sigil-morph" default="none"><i /></ViewTransition>;`;
  // Act
  const violations = findBoundaryViolations(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

test("reports a boundary without default none, which fades on every server-action revalidation", () => {
  // Arrange
  const source = `import { ViewTransition } from "react";
export const A = () => (
  <ViewTransition enter="slide-in">
    <i />
  </ViewTransition>
);`;
  // Act
  const violations = findBoundaryViolations(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, [{ file: "a.tsx", line: 3, rule: "default-none" }]);
});

test("reports a boundary whose default is computed, which no reader can check", () => {
  // Arrange
  const source = `export const A = ({ d }) => <ViewTransition default={d}><i /></ViewTransition>;`;
  // Act
  const violations = findBoundaryViolations(source, "a.tsx");
  // Assert
  assert.deepEqual(violations.map(({ rule }) => rule), ["default-none"]);
});

test("reports a named boundary with no share, whose morph silently resolves to none", () => {
  // Arrange
  const source = `export const A = () => <ViewTransition name="hero" default="none"><i /></ViewTransition>;`;
  // Act
  const violations = findBoundaryViolations(source, "a.tsx");
  // Assert
  assert.deepEqual(violations.map(({ rule }) => rule), ["named-without-share"]);
});

// --- class names ------------------------------------------------------------

test("collects the transition classes a boundary names, including type-keyed maps", () => {
  // Arrange
  const source = `export const A = () => (
  <ViewTransition default="none" share="sigil-morph" enter={{ "nav-forward": "slide-in", default: "none" }} exit="auto">
    <i />
  </ViewTransition>
);`;
  // Act
  const classes = findTransitionClasses(source, "a.tsx");
  // Assert: `auto` and `none` are React keywords, not classes.
  assert.deepEqual(classes.map(({ className }) => className), ["sigil-morph", "slide-in"]);
});

test("reports a class name the stylesheet never styles", () => {
  // Arrange
  const css = `::view-transition-group(.sigil-morph) { animation-duration: 400ms; }`;
  const classes = [
    { file: "a.tsx", line: 1, className: "sigil-morph" },
    { file: "a.tsx", line: 2, className: "sigil-mroph" },
  ];
  // Act
  const undeclared = undeclaredTransitionClasses(classes, css);
  // Assert
  assert.deepEqual(undeclared.map(({ className }) => className), ["sigil-mroph"]);
});

// --- live root --------------------------------------------------------------

test("accepts a live root, which swaps the page instantly", () => {
  // Arrange & Act & Assert
  assert.deepEqual(liveRootGaps(LIVE_ROOT), []);
});

test("reports a root left to cross-fade the whole page", () => {
  // Arrange & Act
  const gaps = liveRootGaps(`::view-transition-new(root) { animation: none; }`);
  // Assert
  assert.deepEqual(gaps, ["::view-transition-old(root) needs display: none"]);
});

// --- The app's own sources -------------------------------------------------

test("every ViewTransition in the app is off by default and morphs only by name", () => {
  // Arrange
  const files = componentSources();
  // Act
  const violations = files.flatMap((file) => findBoundaryViolations(read(file), file));
  // Assert
  assert.deepEqual(violations, []);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every transition class a component names is styled in the app stylesheet", () => {
  // Arrange
  const classes = componentSources().flatMap((file) => findTransitionClasses(read(file), file));
  // Act
  const undeclared = undeclaredTransitionClasses(classes, read("app/globals.css"));
  // Assert
  assert.deepEqual(undeclared, []);
});

test("the app stylesheet keeps the root live, so only named elements animate", () => {
  // Arrange & Act & Assert
  assert.deepEqual(liveRootGaps(read("app/globals.css")), []);
});

test("every boundary exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of BOUNDARY_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file} has no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
