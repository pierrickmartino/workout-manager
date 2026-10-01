import { test } from "node:test";
import assert from "node:assert/strict";

import { moduleSpecifiers } from "./module-specifiers.ts";

// The walk both import guards read. Its own tests live here rather than being inferred from
// theirs, because the two guards use *different* subsets of what it reports — `recharts`
// drops re-exports and type-only imports, `icon` keeps both — and a change to the walk that
// only broke one subset would otherwise be caught by only one guard, if either.

test("reports an import with its line, in source order", () => {
  // Arrange
  const source = `import React from "react";
import { Plus } from "@/components/pulse/icons";`;

  // Act
  const found = moduleSpecifiers(source, "components/a.tsx");

  // Assert
  assert.deepEqual(found.map(({ specifier, line }) => [specifier, line]), [
    ["react", 1],
    ["@/components/pulse/icons", 2],
  ]);
});

test("marks a type-only import, in either form", () => {
  // Arrange — the distinction ADR-0090 exempts on and ADR-0092 does not
  const source = `import type { A } from "./a";
export type { B } from "./b";
import { C } from "./c";`;

  // Act
  const found = moduleSpecifiers(source, "components/a.tsx");

  // Assert
  assert.deepEqual(found.map(({ specifier, isTypeOnly }) => [specifier, isTypeOnly]), [
    ["./a", true],
    ["./b", true],
    ["./c", false],
  ]);
});

test("distinguishes a re-export from an import", () => {
  // Arrange
  const source = `import { A } from "./a";
export { B } from "./b";
export * from "./c";`;

  // Act
  const found = moduleSpecifiers(source, "components/a.tsx");

  // Assert
  assert.deepEqual(found.map(({ specifier, isReExport }) => [specifier, isReExport]), [
    ["./a", false],
    ["./b", true],
    ["./c", true],
  ]);
});

test("ignores an export that names no module", () => {
  // Arrange — a local re-export has no specifier to report
  const source = `const value = 1;
export { value };
export default value;`;

  // Act / Assert
  assert.deepEqual(moduleSpecifiers(source, "lib/a.ts"), []);
});

test("ignores a dynamic import, a comment and a string", () => {
  // Arrange — the three reasons this reads the AST rather than the bytes. The first is
  // load-bearing: ADR-0090's sanctioned pattern is a call expression, so it must not appear
  // here, or the guard built on this would reject the very shape it prescribes.
  const source = `const lazy = () => import("recharts");
// import { Plus } from "lucide-react";
const note = 'import { Plus } from "lucide-react";';`;

  // Act / Assert
  assert.deepEqual(moduleSpecifiers(source, "components/a.tsx"), []);
});

test("reads a module that is not valid JavaScript on its own", () => {
  // Arrange — the sweep hands it `.tsx` with generics and JSX, parsed as TSX throughout
  const source = `import { Plus } from "./icons";
export function A<T,>(props: { value: T }) { return <Plus />; }`;

  // Act / Assert
  assert.deepEqual(moduleSpecifiers(source, "components/a.tsx").map((m) => m.specifier), [
    "./icons",
  ]);
});
