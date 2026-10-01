import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  NATIVE_TAP_TARGETS,
  findUncoveredTapTargets,
  formatTapTargetViolations,
  tapActionSelectors,
} from "./tap-target-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

function globalsCss(): string {
  return readFileSync(resolve(webRoot, "app/globals.css"), "utf8");
}

test("tapActionSelectors reads the selector list off the rule", () => {
  // Arrange
  const css = `@layer base { /* a note */ a, button, [role="button"] { touch-action: manipulation; } }`;

  // Act / Assert — a comment above the rule is not part of its selector list.
  assert.deepEqual(tapActionSelectors(css), ["a", "button", '[role="button"]']);
});

test("tapActionSelectors reports nothing when no rule declares it", () => {
  // Arrange — the shape the stylesheet had before #9, and the shape it would have again if
  // the rule were dropped in a refactor. The sweep below then fails rather than passing
  // vacuously over an empty covered set.
  const css = `@layer base { body { background-color: var(--color-base); } }`;

  // Act / Assert
  assert.deepEqual(tapActionSelectors(css), []);
});

test("the stylesheet covers every natively tappable element", () => {
  // Arrange
  const covered = tapActionSelectors(globalsCss());

  // Act / Assert — a control the rule forgets keeps the ~300ms double-tap delay, which no
  // test of a component could see.
  for (const tag of NATIVE_TAP_TARGETS) {
    assert.ok(covered.includes(tag), `globals.css does not give ${tag} a touch-action`);
  }
});

test("accepts a widget role rendered on an element the rule already covers", () => {
  // Arrange
  const source = `export const A = () => <button role="tab">Specs</button>;`;

  // Act / Assert
  assert.deepEqual(findUncoveredTapTargets(source, "a.tsx", ["button"]), []);
});

test("reports a widget role on an element no rule reaches", () => {
  // Arrange — a tappable thing that is neither a native control nor a `[role="button"]`.
  const source = `export const A = () => <div role="switch" onClick={toggle} />;`;

  // Act
  const violations = findUncoveredTapTargets(source, "a.tsx", ["button", '[role="button"]']);

  // Assert
  assert.deepEqual(violations, [{ file: "a.tsx", line: 1, element: "div", role: "switch" }]);
  assert.match(formatTapTargetViolations(violations), /a\.tsx:1 — <div role="switch">/);
});

test("a role selector in the rule covers whatever element carries it", () => {
  // Arrange
  const source = `export const A = () => <div role="button" onClick={go} />;`;

  // Act / Assert
  assert.deepEqual(findUncoveredTapTargets(source, "a.tsx", ['[role="button"]']), []);
});

test("a role on next/link is read as the anchor it renders", () => {
  // Arrange — the Exercise detail tabs are `<Link role="tab">`, which is an `<a>`.
  const source = `export const A = () => <Link role="tab" href="/x">Specs</Link>;`;

  // Act / Assert
  assert.deepEqual(findUncoveredTapTargets(source, "a.tsx", ["a"]), []);
});

test("a role on any other component is reported rather than guessed at", () => {
  // Arrange — what `<Pill>` renders is not readable from here, and a friendly name is
  // exactly how a `<div>` would slip past an element-name rule.
  const source = `export const A = () => <Pill role="switch" />;`;

  // Act / Assert
  assert.deepEqual(
    findUncoveredTapTargets(source, "a.tsx", ["a", "button"]).map(({ element }) => element),
    ["Pill"],
  );
});

test("a non-interactive role is not a tap target", () => {
  // Arrange — `alert`, `status`, `img` and the grouping roles are read, not tapped.
  const source = `export const A = () => <div role="alert"><span role="img" /><p role="group" /></div>;`;

  // Act / Assert
  assert.deepEqual(findUncoveredTapTargets(source, "a.tsx", []), []);
});

test("no component renders a tap target the stylesheet does not reach", () => {
  // Arrange
  const covered = tapActionSelectors(globalsCss());
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findUncoveredTapTargets(readFileSync(resolve(webRoot, file), "utf8"), file, covered));

  // Assert
  assert.equal(violations.length, 0, `\n${formatTapTargetViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});
