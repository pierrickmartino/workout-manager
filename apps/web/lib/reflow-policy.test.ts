import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  contentFlooredTracks,
  collectElements,
  findReflowViolations,
  formatReflowViolations,
  isExempt,
  isNowrapUtility,
  REFLOW_EXEMPTIONS,
} from "./reflow-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("treats every nowrap spelling as unshrinkable, and wrapping utilities as not", () => {
  // Arrange & Act & Assert
  assert.equal(isNowrapUtility("truncate"), true);
  assert.equal(isNowrapUtility("whitespace-nowrap"), true);
  assert.equal(isNowrapUtility("text-nowrap"), true);
  assert.equal(isNowrapUtility("whitespace-normal"), false);
  assert.equal(isNowrapUtility("break-words"), false);
});

test("reads a bare fr track as content-floored and minmax(0,1fr) as safe", () => {
  // Arrange & Act & Assert
  assert.deepEqual(contentFlooredTracks("grid-cols-[1fr_1.5fr_4rem_auto]"), ["1fr", "1.5fr"]);
  assert.deepEqual(contentFlooredTracks("grid-cols-[minmax(0,1fr)_5rem]"), []);
  assert.deepEqual(contentFlooredTracks("grid-cols-[7rem_auto]"), []);
  assert.deepEqual(contentFlooredTracks("grid-cols-2"), []);
});

test("flags a fieldset that cannot shrink below its content", () => {
  // Arrange
  const source = `export const A = () => <fieldset className="flex flex-col gap-4 border-0 p-0"><p>x</p></fieldset>;`;
  // Act
  const violations = findReflowViolations(source, "a.tsx");
  // Assert
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "fieldset-min-width");
});

test("accepts a fieldset that carries min-w-0", () => {
  // Arrange
  const source = `export const A = () => <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0"><p>x</p></fieldset>;`;
  // Act
  const violations = findReflowViolations(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

// The deliberate absences (ADR-0085). Both were in this guard's first draft; both are
// undecidable from a class string, and a test is a better record of that than a comment alone.
test("does not flag a nowrap value on its own, because truncate clips rather than widens", () => {
  // Arrange
  const interpolated = `export const A = ({ n }: { n: string }) => <span className="truncate">{n}</span>;`;
  // Act
  const violations = findReflowViolations(interpolated, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

test("does not flag a shrink-0 child of a rigid row, because fitting is a width question", () => {
  // Arrange
  const rigid = `export const A = () => <header className="flex items-center justify-between gap-4"><div className="flex flex-col"><h1>t</h1></div><div className="shrink-0">a</div></header>;`;
  // Act
  const violations = findReflowViolations(rigid, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

test("flags a content-floored grid only when its subtree cannot shrink", () => {
  // Arrange
  const risky = `export const A = ({ n }: { n: string }) => <div className="grid grid-cols-[1fr_4rem]"><span className="truncate">{n}</span></div>;`;
  const bounded = `export const A = ({ n }: { n: string }) => <div className="grid grid-cols-[1fr_4rem]"><span>{n}</span></div>;`;
  const safeSpelling = `export const A = ({ n }: { n: string }) => <div className="grid grid-cols-[minmax(0,1fr)_4rem]"><span className="truncate">{n}</span></div>;`;
  // Act & Assert
  assert.equal(findReflowViolations(risky, "a.tsx").length, 1);
  assert.equal(findReflowViolations(risky, "a.tsx")[0].kind, "content-floored-grid");
  assert.deepEqual(findReflowViolations(bounded, "a.tsx"), []);
  assert.deepEqual(findReflowViolations(safeSpelling, "a.tsx"), []);
});

test("flags a fieldset nested in a content-floored track, the shape that reached 789px", () => {
  // Arrange
  const source = `export const A = () => <div className="grid grid-cols-[1fr_auto]"><fieldset className="flex flex-col border-0 p-0"><p>x</p></fieldset></div>;`;
  // Act
  const kinds = findReflowViolations(source, "a.tsx").map((violation) => violation.kind).toSorted();
  // Assert
  assert.deepEqual(kinds, ["content-floored-grid", "fieldset-min-width"]);
});

test("keeps nesting so a child's classes are not read as its parent's", () => {
  // Arrange
  const source = `export const A = () => <div className="flex"><span className="shrink-0">a</span></div>;`;
  // Act
  const [root] = collectElements(source, "a.tsx");
  // Assert
  assert.equal(root.tag, "div");
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].tag, "span");
});

test("every exemption names a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert
  for (const exemption of REFLOW_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 40, `${exemption.file}:${exemption.line} needs a real reason`);
  }
});

test("no component widens a narrow screen", () => {
  // Arrange
  const sources = componentSources();
  // Act
  const violations = sources.flatMap((file) =>
    findReflowViolations(readFileSync(resolve(webRoot, file), "utf8"), file));
  const unexempt = violations.filter((violation) => !isExempt(violation, REFLOW_EXEMPTIONS));
  // Assert
  assert.deepEqual(unexempt, [], `\n${formatReflowViolations(unexempt)}`);
});

test("every registered exemption still corresponds to a real violation", () => {
  // Arrange
  const violations = componentSources().flatMap((file) =>
    findReflowViolations(readFileSync(resolve(webRoot, file), "utf8"), file));
  // Act
  const stale = REFLOW_EXEMPTIONS.filter((exemption) =>
    !violations.some((violation) =>
      violation.file === exemption.file && violation.line === exemption.line && violation.kind === exemption.kind));
  // Assert
  assert.deepEqual(stale, [], "an exemption that no longer matches a violation should be deleted");
});
