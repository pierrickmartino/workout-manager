import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findStraightApostrophes,
  formatStraightApostrophes,
  COPY_EXEMPTIONS,
} from "./copy-typography-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

// The guard's own module is the one file the sweep skips: its registry has to be able
// to spell the straight-apostrophe strings it exempts, and a rule that cannot name its
// own exceptions is unwritable.
const GUARD_MODULE = "lib/copy-typography-policy.ts";

// Every module that can hold a rendered string: the components and pages, and the
// `lib/` view-models the copy was deliberately moved into (ADR-0098 put a dialog's two
// slots in `deleteControlView`), minus the tests.
function copySources(): readonly string[] {
  return ["components", "app", "lib"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => (entry.endsWith(".tsx") || entry.endsWith(".ts")) && !entry.endsWith(".test.ts"))
      .map((entry) => `${directory}/${entry}`))
    .filter((file) => file !== GUARD_MODULE);
}

test("accepts the typographic apostrophe", () => {
  // Arrange
  const source = `export const A = () => <p>This can’t be undone.</p>;`;

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "a.tsx"), []);
});

test("reports a straight apostrophe in JSX text", () => {
  // Arrange
  const source = `export const A = () => <p>This can't be undone.</p>;`;

  // Act
  const findings = findStraightApostrophes(source, "a.tsx");

  // Assert
  assert.deepEqual(findings, [{ file: "a.tsx", line: 1, excerpt: "can't" }]);
  assert.match(formatStraightApostrophes(findings), /a\.tsx:1 — "can't".*’/);
});

test("reports one in an attribute, which is where the placeholders and hints live", () => {
  // Arrange
  const source = `export const A = () => <Field hint="Leave blank to use each Exercise's rest." />;`;

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "a.tsx").map(({ excerpt }) => excerpt),
    ["Exercise's"]);
});

test("reports one in a view-model's string and in a template it interpolates", () => {
  // Arrange — copy lives in `lib/` by design, so the sweep has to reach it.
  const source = "export const body = (name: string) => `You're advancing to ${name} — it won't be reversed.`;";

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "a.ts").map(({ excerpt }) => excerpt),
    ["You're", "won't"]);
});

test("a comment about the rule is not a breach of it", () => {
  // Arrange — read from the AST, so the note explaining why can't → can’t is prose.
  const source = `// The apostrophe here can't be straight.\nexport const A = () => <p>Fine</p>;`;

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "a.tsx"), []);
});

test("a module specifier is not copy", () => {
  // Arrange — the parser hands an import path over as the same kind of node.
  const source = `import { a } from "./o'brien-util.ts";`;

  // Act / Assert
  assert.deepEqual(findStraightApostrophes(source, "a.ts"), []);
});

test("an exemption is scoped to the one word in the one file", () => {
  // Arrange — the registry's shape, asserted on a synthetic entry so the real registry
  // can shrink to nothing without the test going vacuous.
  const source = `export const K = ["world's greatest", "it can't be"];`;

  // Act
  const findings = findStraightApostrophes(source, "lib/session-section.ts");

  // Assert — the exempt keyword is gone, the straggler beside it is not.
  assert.deepEqual(findings.map(({ excerpt }) => excerpt), ["can't"]);
});

test("no rendered string in the app uses a straight apostrophe", () => {
  // Arrange
  const files = copySources();

  // Act
  const findings = files.flatMap((file) =>
    findStraightApostrophes(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(findings.length, 0, `\n${formatStraightApostrophes(findings)}\n`);
  assert.ok(files.length > 200, `expected the sweep to cover components, pages and view-models, saw ${files.length} files`);
});

test("every copy exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert — an exemption says one string is not read by a reader.
  for (const exemption of COPY_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.excerpt} has no reason`);
    assert.ok(copySources().includes(exemption.file), `${exemption.file} is not a copy source`);
    assert.match(exemption.excerpt, /[A-Za-z]'[A-Za-z]/, `${exemption.excerpt} is not a straight apostrophe`);
  }
});
