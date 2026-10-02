import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findLegacyContextApiUses,
  formatLegacyContextApiUses,
} from "./context-api-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

// Swept over the whole web root, following `native-dialog-policy.ts` rather than the chart
// guards: a context is read wherever its consumer hook is written, and a `lib/use-*.ts` hook
// is the obvious next place for one.
const SWEPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "public"]);

function sweptSources(): readonly string[] {
  return readdirSync(resolve(webRoot), { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split("\\").join("/"))
    .filter((entry) => !entry.split("/").some((part) => SKIPPED_DIRECTORIES.has(part)))
    .filter((entry) => SWEPT_EXTENSIONS.some((extension) => entry.endsWith(extension)));
}

test("reports a useContext imported from react", () => {
  // Arrange — the binding is the hook wherever it is later called, so the import is the
  // finding and an alias cannot slip past it.
  const source = `import { useContext as read } from "react";\nconst a = () => read(Ctx);`;

  // Act
  const uses = findLegacyContextApiUses(source, "a.tsx");

  // Assert
  assert.deepEqual(uses, [{ file: "a.tsx", line: 1, api: "useContext" }]);
  assert.match(formatLegacyContextApiUses(uses), /a\.tsx:1 — useContext.*use\(/);
});

test("reports useContext reached through the react namespace", () => {
  // Arrange — a namespace import has no named specifier to catch, so the call site is it.
  const source = `import * as React from "react";\nconst a = () => React.useContext(Ctx);`;

  // Act / Assert
  assert.deepEqual(findLegacyContextApiUses(source, "a.tsx"), [
    { file: "a.tsx", line: 2, api: "useContext" },
  ]);
});

test("reports both tags of a Context.Provider element", () => {
  // Arrange — the opening tag and its closing tag are two lines to edit, so both report.
  const source = `const A = () => (\n  <Ctx.Provider value={v}>\n    {children}\n  </Ctx.Provider>\n);`;

  // Act / Assert
  assert.deepEqual(findLegacyContextApiUses(source, "a.tsx"), [
    { file: "a.tsx", line: 2, api: "Provider" },
    { file: "a.tsx", line: 4, api: "Provider" },
  ]);
  assert.match(
    formatLegacyContextApiUses(findLegacyContextApiUses(source, "a.tsx")),
    /a\.tsx:2 — <Context\.Provider>.*<Context value=/,
  );
});

test("reports a Provider lifted out of its context object", () => {
  // Arrange — aliasing the element is the one way a JSX sweep alone would miss it.
  const source = `const P = Ctx.Provider;\nconst A = () => <P value={v}>{children}</P>;`;

  // Act / Assert
  assert.deepEqual(findLegacyContextApiUses(source, "a.tsx"), [
    { file: "a.tsx", line: 1, api: "Provider" },
  ]);
});

test("reports a Context.Consumer, the trio's render prop", () => {
  // Arrange — there are none in the app; the sweep is what keeps the render-prop count at zero.
  const source = `const A = () => <Ctx.Consumer>{(v) => <p>{v}</p>}</Ctx.Consumer>;`;

  // Act / Assert
  assert.deepEqual(
    findLegacyContextApiUses(source, "a.tsx").map(({ api }) => api),
    ["Consumer", "Consumer"],
  );
  assert.match(
    formatLegacyContextApiUses(findLegacyContextApiUses(source, "a.tsx")),
    /a\.tsx:1 — <Context\.Consumer> is a legacy render prop/,
  );
});

test("creating a context and reading it with use() is the current API", () => {
  // Arrange — `createContext` is not deprecated; only its reader and its provider element are.
  const source =
    `import { createContext, use } from "react";\n` +
    `const Ctx = createContext<string | null>(null);\n` +
    `export const useCtx = () => use(Ctx);\n` +
    `export const A = ({ children }) => <Ctx value="x">{children}</Ctx>;`;

  // Act / Assert
  assert.deepEqual(findLegacyContextApiUses(source, "a.tsx"), []);
});

test("a comment or a string naming the legacy API is not a use of it", () => {
  // Arrange — read from the AST, so the modules that explain the rule do not trip it.
  const source = `// useContext is React 18's reader; Ctx.Provider its element.\nexport const note = "useContext";`;

  // Act / Assert
  assert.deepEqual(findLegacyContextApiUses(source, "a.tsx"), []);
});

test("nothing in the app reads a context with React 18's API", () => {
  // Arrange
  const files = sweptSources();

  // Act
  const uses = files.flatMap((file) =>
    findLegacyContextApiUses(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert — React 19 reads a context with `use()` and renders the context itself as the
  // provider; the 18-era pair still works, so nothing reports a mixed codebase (#6).
  assert.equal(uses.length, 0, `\n${formatLegacyContextApiUses(uses)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the web root, saw ${files.length} files`);
  assert.ok(
    !files.some((file) => file.includes("node_modules/")),
    "node_modules must not be swept",
  );
  // Wider than the components, for the same reason the native-dialog sweep is: a context's
  // consumer hook can live in `lib/`.
  assert.ok(files.some((file) => file.startsWith("lib/")), "lib/ must be swept");
});
