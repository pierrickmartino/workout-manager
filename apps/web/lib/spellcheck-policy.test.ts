import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findUndeclaredSpellCheck,
  formatSpellCheckViolations,
  SPELLCHECK_EXEMPTIONS,
} from "./spellcheck-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("reports a field whose placeholder shows a value pattern and says nothing about spelling", () => {
  // Arrange — `mm:ss` holds no word, so a spell checker can only be wrong about it.
  const source = `export const A = () => <Input placeholder="mm:ss" />;`;

  // Act
  const violations = findUndeclaredSpellCheck(source, "a.tsx");

  // Assert
  assert.deepEqual(violations, [
    { file: "a.tsx", line: 1, element: "Input", placeholder: "mm:ss", reason: "value pattern" },
  ]);
  assert.match(formatSpellCheckViolations(violations), /a\.tsx:1 — <Input>.*spellCheck/);
});

test("accepts the field once it declares the decision", () => {
  // Arrange
  const source = `export const A = () => <div>
    <Input placeholder="3-1-1" spellCheck={false} />
    <Input placeholder="0:45" spellCheck />
  </div>;`;

  // Act / Assert — `true` is an answer too: the guard asks for the decision, not for
  // one of its values.
  assert.deepEqual(findUndeclaredSpellCheck(source, "a.tsx"), []);
});

test("leaves a placeholder made of words to the author", () => {
  // Arrange — a set note and a movement cue are prose, and a red squiggle under a
  // misspelled one is the browser doing its job.
  const source = `export const A = () => <div>
    <Input placeholder="Optional note (e.g. felt easy)" />
    <Textarea placeholder="no running, no jumping in the apartment…" />
  </div>;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredSpellCheck(source, "a.tsx"), []);
});

test("a number field is out of scope — no browser spell-checks one", () => {
  // Arrange
  const source = `export const A = () => <Input type="number" step="0.1" placeholder="70" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredSpellCheck(source, "a.tsx"), []);
});

test("a search field is out of scope — the primitive answers for it", () => {
  // Arrange — `components/ui/input.tsx` derives `spellCheck={false}` from the type.
  const source = `export const A = () => <Input type="search" placeholder="12-15" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredSpellCheck(source, "a.tsx"), []);
});

test("fails closed on a placeholder it cannot read", () => {
  // Arrange — a computed placeholder may be a quantity (`60 kg`) or a name
  // (`Push A · strength`), and the two want opposite answers.
  const source = "export const A = ({ unit }) => <Input placeholder={`60 ${unit}`} />;";

  // Act
  const violations = findUndeclaredSpellCheck(source, "a.tsx");

  // Assert
  assert.deepEqual(violations.map(({ reason }) => reason), ["placeholder unreadable"]);
  assert.match(formatSpellCheckViolations(violations), /cannot be read/);
});

test("a field with no placeholder at all is not this guard's business", () => {
  // Arrange — there is no signature to read, and most fields in the app are labelled
  // rather than placeheld.
  const source = `export const A = () => <Input name="objective" />;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredSpellCheck(source, "a.tsx"), []);
});

test("the mask words in a duration placeholder do not make it prose", () => {
  // Arrange
  const source = `export const A = () => <div>
    <Input placeholder="hh:mm" />
    <Input placeholder="25:00" />
  </div>;`;

  // Act / Assert
  assert.deepEqual(findUndeclaredSpellCheck(source, "a.tsx").map(({ placeholder }) => placeholder),
    ["hh:mm", "25:00"]);
});

test("every value field in the app declares whether its value is a word", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findUndeclaredSpellCheck(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, `\n${formatSpellCheckViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every spellcheck exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of SPELLCHECK_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
