import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findIconImportViolations,
  formatIconImportViolations,
  importedSpecifiers,
  namesIconPackage,
  ICON_IMPORT_EXEMPTIONS,
  ICON_MODULE,
  ICON_SPECIFIER,
} from "./icon-import-policy.ts";
import { sweptWebSources, sweptWebSourcePath } from "./swept-web-sources.ts";

// The **whole** web root, in every source extension — not just `components/` and `app/` the
// way the chart guards sweep. An icon import costs nothing to write anywhere, and the
// design-system coupling it creates is the same wherever it is written, so there is nothing
// to carve out: `scripts/`, `prototypes/` and the `audit/` harness are all swept. (`audit/`
// is exempt from the *chart* guards because it must import a chart statically to mount it
// for the parity assertion; no such need exists for an icon, which it can take from the
// design system like anything else.) The walk itself, and the assertions on its reach, are
// `swept-web-sources.test.ts`'s — this guard was one of the three copies.

test("flags a direct package import at a call site", () => {
  // Arrange — the shape all 66 call sites had before this guard
  const source = `
    import { Plus } from "lucide-react";
    export function Add() { return <Plus />; }`;

  // Act
  const violations = findIconImportViolations(source, "components/pulse/add.tsx");

  // Assert
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].specifier, "lucide-react");
});

test("accepts an icon reached through the design system", () => {
  // Arrange
  const source = `
    import { Plus } from "${ICON_SPECIFIER}";
    export function Add() { return <Plus />; }`;

  // Act / Assert
  assert.deepEqual(findIconImportViolations(source, "components/pulse/add.tsx"), []);
});

test("does not ask the design system's own icon module to answer for the rule", () => {
  // Arrange — the one module that names the package is the point of the rule
  const source = `export { Plus } from "lucide-react";`;

  // Act / Assert
  assert.deepEqual(findIconImportViolations(source, ICON_MODULE), []);
});

test("flags a deep import into the package", () => {
  // Arrange — a fixed list of known icon names would wave this straight through
  const source = `import Plus from "lucide-react/dist/esm/icons/plus";`;

  // Act
  const violations = findIconImportViolations(source, "components/pulse/add.tsx");

  // Assert — fails closed on the package, not on a known export
  assert.equal(violations.length, 1);
  assert.equal(violations[0].specifier, "lucide-react/dist/esm/icons/plus");
  assert.equal(namesIconPackage("lucide-react/dist/esm/icons/plus"), true);
});

test("flags a type-only import of the package", () => {
  // Arrange — `LucideIcon` costs no bytes, but naming it from the package is the same
  // coupling this rule removes, which is why the icon module re-exports the type.
  const source = `import type { LucideIcon } from "lucide-react";
    export interface Props { icon: LucideIcon }`;

  // Act / Assert
  assert.equal(findIconImportViolations(source, "components/pulse/nav-row.tsx").length, 1);
});

test("flags a re-export of the package from anywhere but the icon module", () => {
  // Arrange — a second barrel is the loophole an import-only check would leave open
  const source = `export { Plus } from "lucide-react";`;

  // Act / Assert
  assert.equal(findIconImportViolations(source, "components/ui/icons.ts").length, 1);
});

test("is not satisfied by a package name that merely appears in a comment or a string", () => {
  // Arrange — the reason this reads TypeScript rather than bytes
  const source = `
    // import { Plus } from "lucide-react";
    const note = 'import { Plus } from "lucide-react";';
    export function Card() { return <div>{note}</div>; }`;

  // Act / Assert
  assert.deepEqual(findIconImportViolations(source, "components/pulse/card.tsx"), []);
  assert.equal(importedSpecifiers(source, "components/pulse/card.tsx").length, 0);
});

test("names the file, the line, the specifier and the remedy in its failure message", () => {
  // Arrange
  const source = `import { Trophy } from "lucide-react";
    export function Badge() { return <Trophy />; }`;

  // Act
  const message = formatIconImportViolations(
    findIconImportViolations(source, "app/profile/page.tsx"));

  // Assert
  assert.match(message, /app\/profile\/page\.tsx:1/);
  assert.match(message, /lucide-react/);
  assert.match(message, /components\/pulse\/icons/);
  assert.match(message, /ADR-0092/);
});

test("every exemption carries a reason a reviewer can weigh", () => {
  // Arrange / Act / Assert — an exemption asserts one more file to edit every time the icon
  // set is wrapped or replaced, which is never self-evident
  for (const exemption of ICON_IMPORT_EXEMPTIONS) {
    assert.ok(exemption.reason.length > 60,
      `${exemption.file} needs a reason, not a label`);
  }
});

test("the design system's icon module is in the swept set and does name the package", () => {
  // Arrange — a sanity check on the sweep's own subject: if the icon module stopped
  // existing, or stopped re-exporting, the sweep below would pass for the wrong reason.
  const files = sweptWebSources();

  // Act
  const source = readFileSync(sweptWebSourcePath(ICON_MODULE), "utf8");

  // Assert
  assert.ok(files.includes(ICON_MODULE), `${ICON_MODULE} must be swept`);
  assert.ok(
    importedSpecifiers(source, ICON_MODULE).some(({ specifier }) =>
      namesIconPackage(specifier)),
    `${ICON_MODULE} is the one module that names the icon package`,
  );
});

test("nothing outside the design system's icon module names the icon package", () => {
  // Arrange
  const files = sweptWebSources();

  // Act
  const violations = files.flatMap((file) => findIconImportViolations(
    readFileSync(sweptWebSourcePath(file), "utf8"), file));

  // Assert
  assert.deepEqual(violations, [], `\n${formatIconImportViolations(violations)}`);
});
