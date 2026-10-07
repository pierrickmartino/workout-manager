import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findClerkImportViolations,
  formatClerkImportViolations,
} from "./clerk-import-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

// Every component and page: the control components render, so they live in these two roots.
function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx") || entry.endsWith(".ts"))
      .map((entry) => `${directory}/${entry}`));
}

test("flags a control component Clerk Core 3 removed", () => {
  // Arrange — the root layout's shape before the Core 3 upgrade
  const source = `
    import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
    export default function Layout() { return <ClerkProvider><SignedIn /><SignedOut /></ClerkProvider>; }`;

  // Act
  const violations = findClerkImportViolations(source, "app/layout.tsx");

  // Assert
  assert.deepEqual(violations.map((violation) => violation.imported), ["SignedIn", "SignedOut"]);
  assert.equal(violations[0].line, 2);
});

test("flags Protect, and reads the imported symbol through an alias", () => {
  // Arrange
  const source = `import { Protect as Gate } from "@clerk/nextjs";`;

  // Act / Assert
  assert.deepEqual(
    findClerkImportViolations(source, "components/x.tsx").map((violation) => violation.imported),
    ["Protect"]);
});

test("accepts Show and the components Core 3 kept", () => {
  // Arrange
  const source = `
    import { ClerkProvider, Show, SignInButton, useAuth } from "@clerk/nextjs";
    import { auth } from "@clerk/nextjs/server";`;

  // Act / Assert
  assert.deepEqual(findClerkImportViolations(source, "app/layout.tsx"), []);
});

test("is not tripped by the name in a comment or another package", () => {
  // Arrange — a mention is not an import
  const source = `
    // <SignedIn> was replaced by <Show when="signed-in">
    import { SignedIn } from "./local-shim";`;

  // Act / Assert
  assert.deepEqual(findClerkImportViolations(source, "components/x.tsx"), []);
});

test("names the file, the line and the replacement in its message", () => {
  // Arrange
  const source = `import { SignedOut } from "@clerk/nextjs";`;

  // Act
  const message = formatClerkImportViolations(findClerkImportViolations(source, "app/page.tsx"));

  // Assert
  assert.match(message, /app\/page\.tsx:1/);
  assert.match(message, /<Show when="signed-out">/);
});

test("no component or page imports a control component Clerk Core 3 removed", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findClerkImportViolations(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.deepEqual(violations, [], `\n${formatClerkImportViolations(violations)}`);
});
