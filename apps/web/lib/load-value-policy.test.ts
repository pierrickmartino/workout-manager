import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findLoadValueFields,
  formatLoadValueViolations,
  LOAD_VALUE_EXEMPTIONS,
} from "./load-value-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("reports a Load value field written by hand outside the shared field", () => {
  // Arrange — the keypad call is the signature: every Load value field asks for it.
  const source = `export function Row({ kind, unit }) {
    return <Input inputMode={loadValueInputMode(kind)} placeholder={\`60 \${unit}\`} />;
  }`;

  // Act
  const violations = findLoadValueFields(source, "components/row.tsx");

  // Assert
  assert.deepEqual(violations, [{ file: "components/row.tsx", line: 2, component: "Row" }]);
  assert.match(formatLoadValueViolations(violations), /components\/row\.tsx:2 — Row.*LoadValueInput/);
});

test("names the enclosing component of an arrow-function field", () => {
  // Arrange
  const source = `export const Row = ({ kind }) => <input inputMode={loadValueInputMode(kind)} />;`;

  // Act / Assert
  assert.deepEqual(findLoadValueFields(source, "a.tsx"), [{ file: "a.tsx", line: 1, component: "Row" }]);
});

test("accepts a field rendered through LoadValueInput", () => {
  // Arrange
  const source = `export function Row({ kind, unit }) {
    return <LoadValueInput kind={kind} unit={unit} value="" onChange={() => {}} />;
  }`;

  // Act / Assert
  assert.deepEqual(findLoadValueFields(source, "components/row.tsx"), []);
});

test("the shared field itself is where the hand-written field lives", () => {
  // Arrange
  const source = `export function LoadValueInput({ kind }) {
    return <Input inputMode={loadValueInputMode(kind)} />;
  }`;

  // Act / Assert
  assert.deepEqual(findLoadValueFields(source, "components/pulse/load-value-input.tsx"), []);
});

test("every exemption names a component that still writes its field by hand", () => {
  // An exemption that outlives its field would quietly exempt the next one written there.
  for (const { file, component, reason } of LOAD_VALUE_EXEMPTIONS) {
    assert.ok(reason.trim().length > 0, `${file} ${component} needs a reason`);
    const found = findLoadValueFields(readFileSync(resolve(webRoot, file), "utf8"), file, [])
      .some((violation) => violation.component === component);
    assert.ok(found, `${file} ${component} no longer writes a Load value field; drop the exemption`);
  }
});

test("every Load value field in the app renders through LoadValueInput", () => {
  // Arrange / Act
  const violations = componentSources().flatMap((file) =>
    findLoadValueFields(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, formatLoadValueViolations(violations));
});
