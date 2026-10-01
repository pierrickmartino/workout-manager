import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findAutoFocus,
  formatAutoFocusViolations,
  AUTOFOCUS_EXEMPTIONS,
} from "./autofocus-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("reports a field that takes focus on arrival", () => {
  // Arrange
  const source = `export const A = () => <Input name="name" autoFocus />;`;

  // Act
  const violations = findAutoFocus(source, "a.tsx");

  // Assert
  assert.deepEqual(violations, [{ file: "a.tsx", line: 1, element: "Input" }]);
  assert.match(formatAutoFocusViolations(violations), /a\.tsx:1 — <Input> takes focus/);
});

test("reports it on a native control and on a non-field too", () => {
  // Arrange — the attribute works on anything focusable, and the keyboard it summons
  // on a phone does not care which element asked.
  const source = `export const A = () => <div>
    <input autoFocus={true} />
    <button autoFocus>Go</button>
  </div>;`;

  // Act / Assert
  assert.deepEqual(findAutoFocus(source, "a.tsx").map(({ element }) => element),
    ["input", "button"]);
});

test("reports an autoFocus bound to a condition, which is still an autoFocus", () => {
  // Arrange — `autoFocus={isDesktop}` is the shape the audit floated; it is a decision
  // to report and discuss, not one to let through unseen.
  const source = `export const A = ({ isDesktop }) => <Input autoFocus={isDesktop} />;`;

  // Act / Assert
  assert.deepEqual(findAutoFocus(source, "a.tsx").map(({ element }) => element), ["Input"]);
});

test("leaves a managed focus call alone — that is a different mechanism", () => {
  // Arrange — `lib/use-modal-focus.ts` moves focus when a dialog opens and restores it
  // to the opener on close, which is a response to the reader's own action.
  const source = `export const A = () => { ref.current?.focus(); return <Input ref={ref} />; };`;

  // Act / Assert
  assert.deepEqual(findAutoFocus(source, "a.tsx"), []);
});

test("no component takes focus on arrival", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findAutoFocus(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, `\n${formatAutoFocusViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every autoFocus exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of AUTOFOCUS_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
