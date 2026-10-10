import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EXEMPT_FILES,
  findApiInstantViolations,
  formatApiInstantViolations,
} from "./api-instant-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

// Production sources: the roots that parse what the API serves. Tests build their own instants.
function productionSources(): readonly string[] {
  return ["app", "components", "lib"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts"))
      .map((entry) => `${directory}/${entry}`));
}

test("flags Date.parse of an API instant", () => {
  // Arrange — the sort review caught on the Protocols index (#643)
  const source = `
    const order = (a, b) => Date.parse(b.made_current_at) - Date.parse(a.made_current_at);`;

  // Act
  const violations = findApiInstantViolations(source, "lib/protocols-index.ts");

  // Assert
  assert.deepEqual(violations.map((violation) => violation.shape), ["Date.parse", "Date.parse"]);
  assert.equal(violations[0].line, 2);
});

test("flags new Date of a snake_case API instant field", () => {
  // Arrange
  const source = `const at = new Date(session.created_at!);`;

  // Act / Assert
  assert.deepEqual(
    findApiInstantViolations(source, "components/x.tsx").map((violation) => violation.shape),
    ["new Date"]);
});

test("accepts epoch-ms dates, parseApiInstant, and the instant module itself", () => {
  // Arrange
  const caller = `
    import { parseApiInstant } from "./instant.ts";
    const started = new Date(startedAt);
    const now = new Date();
    const at = parseApiInstant(row.made_current_at);`;

  // Act / Assert
  assert.deepEqual(findApiInstantViolations(caller, "components/x.tsx"), []);
  assert.deepEqual(findApiInstantViolations("Date.parse(normalized);", "lib/instant.ts"), []);
});

test("is not tripped by a comment naming Date.parse", () => {
  // Arrange
  const source = `// never Date.parse(row.created_at) here`;

  // Act / Assert
  assert.deepEqual(findApiInstantViolations(source, "lib/x.ts"), []);
});

test("names the file, the line and the fix in its message", () => {
  // Act
  const message = formatApiInstantViolations(
    findApiInstantViolations("Date.parse(x.created_at);", "lib/x.ts"));

  // Assert
  assert.match(message, /^lib\/x\.ts:1 — Date\.parse/);
  assert.match(message, /parseApiInstant from lib\/instant\.ts/);
});

test("every exemption names a file that still exists", () => {
  // Act / Assert — a stale exemption would silently excuse whatever takes its path next
  for (const file of EXEMPT_FILES.keys()) {
    assert.ok(existsSync(resolve(webRoot, file)), `${file} is exempt but no longer exists`);
  }
});

test("no production source parses an API instant outside lib/instant.ts", () => {
  // Act
  const violations = productionSources().flatMap((file) =>
    findApiInstantViolations(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.deepEqual(violations, [], formatApiInstantViolations(violations));
});
