import ts from "typescript";

// #6: `components/NavigationGuardProvider.tsx` was the app's only context, and it was written
// against React 18 — `useContext(Ctx)` to read it, `<Ctx.Provider value={…}>` to provide it.
// React 19 reads a context with `use()` and renders the context object itself as the provider
// (ADR-0110).
//
// The 18-era pair still works, which is the whole problem: nothing reports a codebase that
// reads a context two different ways, and the next context is written by copying the one
// already there. Two were in fact written against `use()` (ADR-0105, ADR-0106) while this one
// was not, so the codebase already disagreed with itself.
//
// What is swept, and why each shape is a finding:
//
//   - a named import of `useContext` from `"react"` — the *binding*, not the call, because an
//     alias (`useContext as read`) would read as any other function at the call site;
//   - a property access named `useContext` — the namespace path (`React.useContext`), which
//     has no named specifier to catch;
//   - a property access named `Provider` — which covers `<Ctx.Provider>`'s tag (TypeScript
//     parses a JSX dotted tag name as a property access, so the closing tag reports too) and
//     `const P = Ctx.Provider`, the one shape a JSX-only sweep would miss;
//   - a property access named `Consumer` — the third member of the same trio, which React's
//     reference marks legacy and which is a render prop, one of the two rules this codebase
//     passes with zero occurrences. There are none to migrate; the sweep is what keeps it so.
//
// `createContext` is deliberately not a finding: it is how a context is still made.
//
// Read from the AST rather than by searching the text, so a module may name the legacy API in
// a comment — this one does — without tripping the rule it is documenting.

export type LegacyContextApi = "useContext" | "Provider" | "Consumer";

export interface LegacyContextApiUse {
  readonly file: string;
  readonly line: number;
  readonly api: LegacyContextApi;
}

// The remedy for each shape, written at the site that has to change.
const REMEDIES: Readonly<Record<LegacyContextApi, string>> = {
  useContext:
    "useContext is React 18's reader for a context: read it with use(Ctx) instead (ADR-0110).",
  Provider:
    "<Context.Provider> is React 18's provider element: render <Context value={…}> instead " +
    "(ADR-0110).",
  Consumer:
    "<Context.Consumer> is a legacy render prop: read the context with use(Ctx) in the " +
    "component that needs it (ADR-0110).",
};

// Whether an import declaration names the `react` package itself. A deep path
// (`react/jsx-runtime`) exports neither of these.
function importsReact(node: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "react"
  );
}

// The legacy API an import declaration binds, or null. Only `useContext` is bindable this way:
// a `Provider` is reached through a context object, never imported.
function legacyApiImported(node: ts.ImportDeclaration): LegacyContextApi | null {
  if (!importsReact(node)) return null;
  const bindings = node.importClause?.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) return null;
  const imported = bindings.elements.some(
    (element) => (element.propertyName ?? element.name).text === "useContext",
  );
  return imported ? "useContext" : null;
}

export function findLegacyContextApiUses(
  source: string,
  file: string,
): readonly LegacyContextApiUse[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uses: LegacyContextApiUse[] = [];
  const report = (node: ts.Node, api: LegacyContextApi): void => {
    uses.push({
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      api,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const api = legacyApiImported(node);
      if (api !== null) report(node, api);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === "useContext") report(node, "useContext");
      if (node.name.text === "Provider") report(node, "Provider");
      if (node.name.text === "Consumer") report(node, "Consumer");
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return uses;
}

export function formatLegacyContextApiUses(
  uses: readonly LegacyContextApiUse[],
): string {
  return uses.map(({ file, line, api }) => `${file}:${line} — ${REMEDIES[api]}`).join("\n");
}
