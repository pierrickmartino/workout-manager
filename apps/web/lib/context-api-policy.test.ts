import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findLegacyContextApiUses,
  formatLegacyContextApiUses,
} from "./context-api-policy.ts";
// The whole web root, following `native-dialog-policy.ts` rather than the chart guards: a
// context is read wherever its consumer hook is written, and a `lib/use-*.ts` hook is the
// obvious next place for one. `swept-web-sources.test.ts` holds the sweep's own reach.
import { sweptWebSources, sweptWebSourcePath } from "./swept-web-sources.ts";

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

test("reports a Provider lifted out of its context object, by any of the three routes", () => {
  // Arrange — aliasing the element is what a JSX-only sweep misses, and it can be written as
  // a property access, a literal key, or a destructure with or without a rename.
  const lifted = [
    `const P = Ctx.Provider;`,
    `const P = Ctx["Provider"];`,
    `const { Provider } = Ctx;`,
    `const { Provider: P } = Ctx;`,
  ];

  // Act / Assert
  for (const source of lifted) {
    assert.deepEqual(
      findLegacyContextApiUses(source, "a.tsx"),
      [{ file: "a.tsx", line: 1, api: "Provider" }],
      source,
    );
  }
});

test("reports useContext destructured or read by literal key off the namespace", () => {
  // Arrange — the two routes that reach the hook without a named specifier to catch.
  const sources = [
    `import * as React from "react";\nconst { useContext } = React;`,
    `const a = () => React["useContext"](Ctx);`,
  ];

  // Act / Assert
  for (const source of sources) {
    assert.deepEqual(
      findLegacyContextApiUses(source, "a.tsx").map(({ api }) => api),
      ["useContext"],
      source,
    );
  }
});

test("a member picked at runtime is not read, and is not pretended to be", () => {
  // Arrange — a computed key is a context member chosen at runtime; no static sweep resolves
  // it, nothing in this app writes one, and claiming otherwise would be the false confidence
  // the fail-closed guards exist to avoid.
  const source = `const P = Ctx[name];`;

  // Act / Assert
  assert.deepEqual(findLegacyContextApiUses(source, "a.tsx"), []);
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
  const files = sweptWebSources();

  // Act
  const uses = files.flatMap((file) =>
    findLegacyContextApiUses(readFileSync(sweptWebSourcePath(file), "utf8"), file));

  // Assert — React 19 reads a context with `use()` and renders the context itself as the
  // provider; the 18-era pair still works, so nothing reports a mixed codebase (#6).
  assert.equal(uses.length, 0, `\n${formatLegacyContextApiUses(uses)}\n`);
});
