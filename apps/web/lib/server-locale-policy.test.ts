import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SERVER_LOCALE_EXEMPTIONS,
  findServerClockFormatting,
  formatServerClockViolations,
} from "./server-locale-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("reports an instant formatted against the server's own clock", () => {
  // Arrange — the exact shape the admin audit trail had.
  const source = `export const A = ({ at }) => <span>{new Date(at).toLocaleString()}</span>;`;

  // Act
  const violations = findServerClockFormatting(source, "a.tsx");

  // Assert
  assert.deepEqual(violations, [{ file: "a.tsx", line: 1, method: "toLocaleString" }]);
  assert.match(
    formatServerClockViolations(violations),
    /a\.tsx:1 — toLocaleString .*pulse\/local-instant\.tsx/,
  );
});

test("follows a Date through a local binding", () => {
  // Arrange — naming the Date first does not move it to the reader's machine.
  const source = `export const A = ({ at }) => {
    const stamped = new Date(at);
    return <span>{stamped.toLocaleString()}</span>;
  };`;

  // Act / Assert
  assert.deepEqual(findServerClockFormatting(source, "a.tsx").map(({ method }) => method),
    ["toLocaleString"]);
});

test("reports the date and time formatters wherever they appear", () => {
  // Arrange — these two exist only on a Date, so no receiver analysis is needed.
  const source = `export const A = ({ at, when }) => <span>
    {at.toLocaleDateString()}{when.toLocaleTimeString()}
    {new Intl.DateTimeFormat().format(at)}
  </span>;`;

  // Act / Assert
  assert.deepEqual(findServerClockFormatting(source, "a.tsx").map(({ method }) => method),
    ["toLocaleDateString", "toLocaleTimeString", "Intl.DateTimeFormat"]);
});

test("leaves a number's grouping alone", () => {
  // Arrange — a thousands separator resolved on the server is a cosmetic mismatch, not a
  // wrong moment, and this guard is about the clock. `level-badge.tsx` renders XP this way.
  const source = `export const A = ({ xp }) => <span>{xp.toLocaleString()} XP</span>;`;

  // Act / Assert
  assert.deepEqual(findServerClockFormatting(source, "a.tsx"), []);
});

test("a Client Component may format however it likes", () => {
  // Arrange — in a browser the ambient locale *is* the reader's, which is the whole point.
  const source = `"use client";
    export const A = ({ at }) => <span>{new Date(at).toLocaleString()}</span>;`;

  // Act / Assert
  assert.deepEqual(findServerClockFormatting(source, "a.tsx"), []);
});

test("a directive written below the imports does not buy an exemption", () => {
  // Arrange — Next.js ignores a `"use client"` that is not in the directive prologue, so this
  // module is still a Server Component. A guard that read it as a client one would fail open on
  // exactly the file whose author thought they had opted out.
  const source = `import { thing } from "./thing";
    "use client";
    export const A = ({ at }) => <span>{new Date(at).toLocaleString()}</span>;`;

  // Act / Assert
  assert.deepEqual(findServerClockFormatting(source, "a.tsx").map(({ method }) => method),
    ["toLocaleString"]);
});

test("a directive behind other directives still counts", () => {
  // Arrange — a prologue may hold more than one.
  const source = `"use strict";
    "use client";
    export const A = ({ at }) => <span>{new Date(at).toLocaleString()}</span>;`;

  // Act / Assert
  assert.deepEqual(findServerClockFormatting(source, "a.tsx"), []);
});

test("no Server Component writes an instant in the container's clock", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findServerClockFormatting(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, `\n${formatServerClockViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every server-clock exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of SERVER_LOCALE_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.method} has no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
