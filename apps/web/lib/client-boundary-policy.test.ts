import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findServerCallsToClientExports,
  formatServerCallsToClientExports,
  isClientModuleSource,
  serverReachableModules,
  webClientModuleResolver,
} from "./client-boundary-policy.ts";
import { sweptWebSources, sweptWebSourcePath } from "./swept-web-sources.ts";

// ADR-0113's first cut had the Session detail page — a Server Component — call
// `actionSheetItemClass()`, a plain function exported from a `"use client"` module. On the server
// such an import is a client *reference*, not the function, so calling it throws while the page
// renders: every Session detail page failed to open. `next build` passed, every test passed, and
// the audit harness renders client-side, so nothing in the repo could see it. This guard can.

const CLIENT = new Set(["@/components/sheet"]);
const isClient = (specifier: string): boolean => CLIENT.has(specifier);

test("reports a server module calling a function a client module exports", () => {
  // Arrange
  const source = [
    'import { sheetRow } from "@/components/sheet";',
    "export default function Page() {",
    "  return <a className={sheetRow()} />;",
    "}",
  ].join("\n");

  // Act
  const calls = findServerCallsToClientExports(source, "app/page.tsx", isClient);

  // Assert
  assert.deepEqual(calls, [
    { file: "app/page.tsx", line: 3, name: "sheetRow", from: "@/components/sheet" },
  ]);
  assert.match(
    formatServerCallsToClientExports(calls),
    /app\/page\.tsx:3 — sheetRow\(\) is called on the server.*"use client"/,
  );
});

test("rendering a client component, or passing one along, is not a call", () => {
  // Arrange — both are exactly what a client reference is for.
  const source = [
    'import { Sheet, Row } from "@/components/sheet";',
    "export default function Page() {",
    "  return <Sheet item={Row}><Row /></Sheet>;",
    "}",
  ].join("\n");

  // Act / Assert
  assert.deepEqual(findServerCallsToClientExports(source, "app/page.tsx", isClient), []);
});

test("a client module may call another client module's functions", () => {
  // Arrange
  const source = [
    '"use client";',
    'import { sheetRow } from "@/components/sheet";',
    "export const Row = () => <a className={sheetRow()} />;",
  ].join("\n");

  // Act / Assert
  assert.deepEqual(findServerCallsToClientExports(source, "components/row.tsx", isClient), []);
});

test("an aliased or default import is the same client reference", () => {
  // Arrange
  const source = [
    'import makeRow, { sheetRow as row } from "@/components/sheet";',
    "export const a = row();",
    "export const b = makeRow();",
  ].join("\n");

  // Act / Assert
  assert.deepEqual(
    findServerCallsToClientExports(source, "app/page.tsx", isClient).map(({ name }) => name),
    ["row", "makeRow"],
  );
});

test("a type-only import is erased and calls nothing", () => {
  // Arrange
  const source = [
    'import type { SheetRow } from "@/components/sheet";',
    'import { type Other } from "@/components/sheet";',
    "export const a = (row: SheetRow, other: Other) => row;",
  ].join("\n");

  // Act / Assert
  assert.deepEqual(findServerCallsToClientExports(source, "app/page.tsx", isClient), []);
});

test("the directive is read from the module's first statement, not from its text", () => {
  // Assert
  assert.equal(isClientModuleSource('"use client";\nexport const a = 1;'), true);
  assert.equal(isClientModuleSource("'use client'\nexport const a = 1;"), true);
  assert.equal(isClientModuleSource('// "use client" is not needed here\nexport const a = 1;'), false);
  assert.equal(isClientModuleSource('export const a = 1;\n"use client";'), false);
});

test("the resolver finds the real action sheet to be a client module", () => {
  // Arrange — the resolver must actually reach files, or every sweep below is clean by default.
  const resolve = webClientModuleResolver("components/RemoveExerciseButton.tsx");

  // Assert
  assert.equal(resolve("@/components/pulse/action-sheet"), true);
  assert.equal(resolve("@/lib/utils"), false);
  assert.equal(resolve("react"), false, "a package is not the web root's to classify");
});

test("the server runs what a route reaches, and stops at the first client module", () => {
  // Arrange — `field.tsx` has no directive and calls a client hook, which is safe because only
  // client code imports it. `helper.ts` has none either, but a page reaches it, so it is server.
  const modules: Record<string, string> = {
    "app/page.tsx": 'import { Form } from "@/components/form"; import { h } from "@/lib/helper";',
    "app/client-page.tsx": '"use client"; import { Field } from "@/components/field";',
    "components/form.tsx": '"use client"; import { Field } from "@/components/field";',
    "components/field.tsx": 'import { useClaim } from "@/components/claim";',
    "lib/helper.ts": 'export { x } from "./shared";',
    "lib/shared.ts": "export const x = 1;",
  };
  const resolveModule = (_importer: string, specifier: string): string | null => {
    const relative = specifier.startsWith("./") ? `lib/${specifier.slice(2)}` : specifier.slice(2);
    return [`${relative}.tsx`, `${relative}.ts`].find((path) => path in modules) ?? null;
  };

  // Act
  const reached = serverReachableModules(
    ["app/page.tsx", "app/client-page.tsx"],
    (entry) => modules[entry],
    resolveModule,
  );

  // Assert
  assert.deepEqual([...reached].sort(), ["app/page.tsx", "lib/helper.ts", "lib/shared.ts"]);
});

test("no module the server runs calls a client module's function", () => {
  // Arrange — `audit/` is a Vite single-page harness with no server at all, so it has no routes
  // to start from; everything else is reached, or not, from `app/`.
  const routes = sweptWebSources().filter((entry) => entry.startsWith("app/"));
  const sources = [...serverReachableModules(routes)];
  assert.ok(sources.includes("app/sessions/[id]/page.tsx"), "the walk never reached a page");
  assert.ok(sources.includes("components/SessionCard.tsx"), "the walk never left app/");

  // Act
  const calls = sources.flatMap((entry) =>
    findServerCallsToClientExports(
      readFileSync(sweptWebSourcePath(entry), "utf8"),
      entry,
      webClientModuleResolver(entry),
    ),
  );

  // Assert
  assert.deepEqual(calls, [], formatServerCallsToClientExports(calls));
});
