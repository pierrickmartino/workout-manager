import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findUnbalancedDisplayHeadings,
  formatUnbalancedHeadings,
  DISPLAY_HEADING_EXEMPTIONS,
} from "./display-heading-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("accepts a display heading that balances its wrap", () => {
  // Arrange
  const source = `export const A = () => <h1 className="font-display text-2xl text-balance">Hi</h1>;`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx"), []);
});

test("reports a display heading that lets the browser widow it", () => {
  // Arrange
  const source = `export const A = () => <h2 className="font-display text-2xl font-bold">Hi</h2>;`;

  // Act
  const findings = findUnbalancedDisplayHeadings(source, "a.tsx");

  // Assert
  assert.deepEqual(findings, [
    { file: "a.tsx", line: 1, element: "h2", reason: "no text-balance" },
  ]);
  assert.match(formatUnbalancedHeadings(findings), /a\.tsx:1 — <h2>.*text-balance/);
});

test("text-pretty is the other acceptable answer", () => {
  // Arrange — `pretty` is the right call for a long title where balancing would
  // centre a two-word last line; either says the wrap was decided.
  const source = `export const A = () => <h2 className="font-display text-pretty">Hi</h2>;`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx"), []);
});

test("reads the classes through a cn() call, as the primitives write them", () => {
  // Arrange
  const source = `export const A = ({ className }) => (
    <h3 className={cn("font-display text-xl tracking-tight", className)} />
  );`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx").map(({ element }) => element),
    ["h3"]);
});

test("a heading that cannot wrap has no wrap to balance", () => {
  // Arrange — one line by construction, so `text-balance` would be inert.
  const source = `export const A = () => <div>
    <h2 className="truncate font-display text-base">Hi</h2>
    <h3 className="line-clamp-1 font-display text-base">Hi</h3>
  </div>;`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx"), []);
});

test("a two-line clamp still wraps, so it still balances", () => {
  // Arrange
  const source = `export const A = () => <h2 className="line-clamp-2 font-display">Hi</h2>;`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx").map(({ element }) => element),
    ["h2"]);
});

test("leaves a heading that is not a display title alone", () => {
  // Arrange — the mono section divider and eyebrow forms are label-sized and set in
  // small caps; a balanced wrap is a property of a display title.
  const source = `export const A = () => <h2 className="label-mono text-[11px] text-cyan">WEEK CYCLE</h2>;`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx"), []);
});

test("fails closed on a heading whose classes it cannot read", () => {
  // Arrange — a className bound to a variable could be a display title or a label, and
  // the benign reading is the one that can be silently wrong.
  const source = `export const A = ({ cls }) => <h2 className={cls}>Hi</h2>;`;

  // Act
  const findings = findUnbalancedDisplayHeadings(source, "a.tsx");

  // Assert
  assert.deepEqual(findings, [
    { file: "a.tsx", line: 1, element: "h2", reason: "classes unreadable" },
  ]);
  assert.match(formatUnbalancedHeadings(findings), /cannot be read/);
});

test("a heading with no classes at all declares no display title", () => {
  // Arrange — Tailwind's preflight leaves it at body size; there is no display wrap.
  const source = `export const A = () => <h2>Hi</h2>;`;

  // Act / Assert
  assert.deepEqual(findUnbalancedDisplayHeadings(source, "a.tsx"), []);
});

test("every display heading in the app balances its wrap", () => {
  // Arrange
  const files = componentSources();

  // Act
  const findings = files.flatMap((file) =>
    findUnbalancedDisplayHeadings(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(findings.length, 0, `\n${formatUnbalancedHeadings(findings)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every display-heading exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of DISPLAY_HEADING_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
