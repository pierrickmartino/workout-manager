import ts from "@typescript/typescript6";

// #6: `components/NavigationGuardProvider.tsx` was the app's oldest context, and the one left
// on React 18 — `useContext(Ctx)` to read it, `<Ctx.Provider value={…}>` to provide it. React
// 19 reads a context with `use()` and renders the context object itself as the provider
// (ADR-0110).
//
// The 18-era pair still works, which is the whole problem: nothing reports a codebase that
// reads a context two different ways, and the next context is written by copying one already
// there. The three added after the audit were written against `use()` (ADR-0105, ADR-0106,
// ADR-0107) while the app-wide one — the likeliest to be opened and copied — was not.
//
// `createContext` is deliberately not a finding: it is how a context is still made.
//
// Read from the AST rather than by searching the text, so a module may name the legacy API in
// a comment — this one does — without tripping the rule it is documenting.
//
// ## What is swept, and why each shape
//
// The subject is one of three *names*, reached by any of the four routes a module has to one:
//
//   - an **import specifier** — `import { useContext } from "react"`, reported at the
//     specifier rather than at the call, because `useContext as read` would read as any other
//     function at its call site. In practice only `useContext` arrives this way, a `Provider`
//     being reached through a context object rather than imported, and the specifier is not
//     gated on the module for the same reason the rest of this guard is not gated on the
//     receiver (below);
//   - a **property access** — `React.useContext`, and both tags of `<Ctx.Provider>`, since
//     TypeScript parses a dotted JSX tag name as a property access and both lines do have to
//     change;
//   - an **element access** with a literal key — `Ctx["Provider"]`;
//   - a **binding element** — `const { Provider } = Ctx`, or `const { Provider: P } = Ctx`,
//     which is how the element is lifted out of a context object before it is rendered.
//
// The last two close what a property-access sweep alone leaves open. A computed key
// (`Ctx[name]`) is not read, and is not pretended to be: that is a context member picked at
// runtime, which nothing in this app does and which no static sweep can resolve.
//
// `Consumer` is swept although the finding did not ask for it: it is the trio's third member,
// React's reference marks it legacy, and it is a render prop — the rule the composition audit
// found this codebase passing with zero occurrences and called load-bearing. There is none to
// migrate, so this is not a fix; it is what keeps that zero.
//
// ## What this guard deliberately does not do
//
// It keys on the member's **name**, with no check on what it is read from — unlike
// `native-dialog-policy.ts`, which gates `confirm` on a known global. A context object has no
// canonical name, so there is nothing to gate on, and the cost of that breadth is that an
// unrelated `x.Provider` would report. Nothing in the app or in how it uses its dependencies
// has such a member, so there is no exemption registry: a genuine third-party `.Provider` is
// where one would be added, with its reason, rather than a mechanism standing empty for a
// caller that does not exist.
//
// It came within one naming decision of a false positive, which is worth knowing before the
// next compound family is written: the composition audit's suggested shape for `SetEntry`
// (#2) put its two providers *in* the namespace as `Provider` and `FormProvider`, and
// ADR-0106 instead left them top-level exports. Had it taken the suggestion, every
// `<SetEntry.Provider>` call site would report here.

export type LegacyContextApi = "useContext" | "Provider" | "Consumer";

export interface LegacyContextApiUse {
  readonly file: string;
  readonly line: number;
  readonly api: LegacyContextApi;
}

const LEGACY_APIS: ReadonlySet<string> = new Set<LegacyContextApi>([
  "useContext",
  "Provider",
  "Consumer",
]);

// The remedy for each name, written for the site that has to change.
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

function legacyApi(name: string): LegacyContextApi | null {
  return LEGACY_APIS.has(name) ? (name as LegacyContextApi) : null;
}

// The name a node reads off some object, or null when it reads none statically. One function
// for all four routes, so a new route is one case rather than a fourth branch in the walk.
function memberRead(node: ts.Node): string | null {
  if (ts.isImportSpecifier(node)) {
    return (node.propertyName ?? node.name).text;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  if (ts.isBindingElement(node)) {
    const bound = node.propertyName ?? node.name;
    return ts.isIdentifier(bound) ? bound.text : null;
  }
  return null;
}

export function findLegacyContextApiUses(
  source: string,
  file: string,
): readonly LegacyContextApiUse[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uses: LegacyContextApiUse[] = [];
  const visit = (node: ts.Node): void => {
    const name = memberRead(node);
    const api = name === null ? null : legacyApi(name);
    if (api !== null) {
      uses.push({
        file,
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        api,
      });
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
