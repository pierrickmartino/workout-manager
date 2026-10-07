import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findUndeclaredFormControls,
  formatFormControlViolations,
  FORM_CONTROL_EXEMPTIONS,
} from "./form-input-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("accepts a native control that declares both affordances", () => {
  // Arrange
  const source = `export const A = () => <input type="number" autoComplete="off" inputMode="numeric" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx"), []);
});

test("reports a hand-rolled text field that never says what autofill should do", () => {
  // Arrange
  const source = `export const A = () => <input name="query" className="h-11" />;`;

  // Act
  const violations = findUndeclaredFormControls(source, "a.tsx");

  // Assert — no `type` is a text field, which is exactly what a password manager offers
  // to fill.
  assert.deepEqual(violations, [{ file: "a.tsx", line: 1, element: "input", attribute: "autoComplete" }]);
  assert.match(formatFormControlViolations(violations), /a\.tsx:1 — <input>.*autoComplete.*components\/ui\/input/);
});

test("reports a number field with no keypad", () => {
  // Arrange
  const source = `export const A = () => <input type="number" autoComplete="off" />;`;

  // Act
  const violations = findUndeclaredFormControls(source, "a.tsx");

  // Assert
  assert.deepEqual(violations.map(({ attribute }) => attribute), ["inputMode"]);
});

test("leaves the control types no browser offers to fill alone", () => {
  // Arrange — a hidden value, a checkbox, a radio and a file picker have nothing to autofill
  // and no keyboard to pick.
  const source = `export const A = () => <form>
    <input type="hidden" name="session_id" value="1" />
    <input type="checkbox" name="agree" />
    <input type="radio" name="mode" />
    <input type="file" accept="image/png" />
    <input type="submit" value="Save" />
  </form>;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx"), []);
});

test("fails closed on a type it cannot read, for both affordances", () => {
  // Arrange — a computed type could be anything: `text`, which autofills, or `number`, which
  // needs a keypad. Neither question can be answered, so both are asked.
  const source = `export const A = ({ kind }) => <input type={kind} step="0.1" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx").map(({ attribute }) => attribute),
    ["autoComplete", "inputMode"]);
});

test("a computed type that declares both affordances passes", () => {
  // Arrange — stating them is the way out, as it is for a known type.
  const source = `export const A = ({ kind }) => <input type={kind} autoComplete="off" inputMode="numeric" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx"), []);
});

test("a spread of unknown props does not count as declaring the affordance", () => {
  // Arrange — this is the shape the primitive has, and the reason it states both
  // attributes itself: `...props` may or may not carry them.
  const source = `export const A = (props) => <input {...props} />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx").map(({ attribute }) => attribute),
    ["autoComplete"]);
});

test("every picker and free-text control declares its autofill too", () => {
  // Arrange
  const source = `export const A = () => <div><select name="scheme" /><textarea name="note" /></div>;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx").map(({ element }) => element),
    ["select", "textarea"]);
});

test("ignores the design-system components that wrap a native control", () => {
  // Arrange — `<Input>` carries the defaults; only the lowercase element is the raw one.
  const source = `export const A = () => <Input type="number" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredFormControls(source, "a.tsx"), []);
});

test("no component leaves a native control's autofill or keypad undeclared", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findUndeclaredFormControls(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, `\n${formatFormControlViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every form-control exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of FORM_CONTROL_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.attribute} has no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
