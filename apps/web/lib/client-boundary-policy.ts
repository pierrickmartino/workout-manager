import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import ts from "typescript";

// A Server Component may *render* a client component and *pass* a client export along as a prop,
// because that is what a client reference is for. It may never *call* one: on the server, an
// export of a `"use client"` module is a reference to code that only exists in the browser, and
// invoking it throws while the page renders — "Attempted to call x() from the server but x is on
// the client".
//
// That is how ADR-0113's first cut broke every Session detail page: the page called
// `actionSheetItemClass()`, a pure class-string helper that happened to live beside the sheet in
// a client module. `next build` does not render a dynamic route, the tests mounted the sheet
// rather than the page, and the audit harness renders client-side, so nothing saw it. A helper
// a server module calls belongs in a module with no directive (`action-sheet-item.tsx`).
//
// A "server module" is one the server actually runs: reachable from a route module under `app/`
// without crossing a `"use client"` boundary (`serverReachableModules`). Having no directive is not
// enough — `components/ui/input.tsx` has none and calls a client hook, correctly, because only
// client components ever import it, which makes it client code too.

export interface ServerCallToClientExport {
  readonly file: string;
  readonly line: number;
  // The local binding the call names, which is the alias when the import renamed it.
  readonly name: string;
  readonly from: string;
}

// The `"use client"` directive is a module's first statement, as a string expression. Read from
// the AST, so a comment that mentions it — or a string that says it further down — is not one.
export function isClientModuleSource(source: string): boolean {
  const tree = ts.createSourceFile("m.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const first = tree.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client"
  );
}

// The value bindings an import declaration introduces. A type-only import or specifier is erased
// before anything runs, so it can name nothing to call.
function valueBindings(declaration: ts.ImportDeclaration): readonly string[] {
  const clause = declaration.importClause;
  if (clause === undefined || clause.isTypeOnly) return [];
  const names = clause.name ? [clause.name.text] : [];
  const bindings = clause.namedBindings;
  if (bindings === undefined) return names;
  if (ts.isNamespaceImport(bindings)) return [...names, bindings.name.text];
  return [
    ...names,
    ...bindings.elements.filter((element) => !element.isTypeOnly).map((element) => element.name.text),
  ];
}

export function findServerCallsToClientExports(
  source: string,
  file: string,
  isClientModule: (specifier: string) => boolean,
): readonly ServerCallToClientExport[] {
  if (isClientModuleSource(source)) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const origins = new Map<string, string>();
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!isClientModule(specifier)) continue;
    for (const name of valueBindings(statement)) origins.set(name, specifier);
  }
  if (origins.size === 0) return [];

  const calls: ServerCallToClientExport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      // `x()` and, for a namespace import, `ns.x()` — both invoke the reference.
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.expression
        : node.expression;
      const from = ts.isIdentifier(callee) ? origins.get(callee.text) : undefined;
      if (from !== undefined) {
        calls.push({
          file,
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          name: node.expression.getText(tree),
          from,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

const WEB_ROOT = resolve(import.meta.dirname, "..");
const MODULE_EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

// The web-root-relative module an import specifier names, as written in `importer`, or null for a
// package — which is not the web root's to classify: the guard is about this app's own modules,
// where the mistake is a helper filed in the wrong place.
export function resolveWebModule(importer: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? specifier.slice("@/".length)
    : specifier.startsWith(".")
      ? normalize(join(dirname(importer), specifier))
      : null;
  if (base === null) return null;
  const path = [base, ...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`)].find(
    (candidate) => /\.tsx?$/.test(candidate) && existsSync(join(WEB_ROOT, candidate)),
  );
  return path ?? null;
}

function readWebModule(entry: string): string {
  return readFileSync(join(WEB_ROOT, entry), "utf8");
}

// Whether an import specifier, as written in `importer`, names a client module in the web root.
export function webClientModuleResolver(importer: string): (specifier: string) => boolean {
  return (specifier) => {
    const entry = resolveWebModule(importer, specifier);
    return entry !== null && isClientModuleSource(readWebModule(entry));
  };
}

// Every specifier a module imports or re-exports from, type-only ones included: a module that
// imports only types from another does not run it, but over-reaching here can only add a module
// to the server set, and every module it adds is then checked rather than skipped.
function importedSpecifiers(source: string): readonly string[] {
  const tree = ts.createSourceFile("m.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  return tree.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

// The modules the server runs: every directive-less module under `app/` (pages, layouts, route
// handlers, server actions), and everything they reach through imports until a `"use client"`
// module, where the graph crosses into the browser and stops. `read` and `resolveModule` default
// to the real web root; a test passes its own.
export function serverReachableModules(
  roots: readonly string[],
  read: (entry: string) => string = readWebModule,
  resolveModule: (importer: string, specifier: string) => string | null = resolveWebModule,
): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = roots.filter((entry) => !isClientModuleSource(read(entry)));
  while (pending.length > 0) {
    const entry = pending.pop()!;
    if (reached.has(entry)) continue;
    reached.add(entry);
    for (const specifier of importedSpecifiers(read(entry))) {
      const next = resolveModule(entry, specifier);
      if (next !== null && !reached.has(next) && !isClientModuleSource(read(next))) pending.push(next);
    }
  }
  return reached;
}

export function formatServerCallsToClientExports(
  calls: readonly ServerCallToClientExport[],
): string {
  return calls
    .map(
      ({ file, line, name, from }) =>
        `${file}:${line} — ${name}() is called on the server, but ${from} is a "use client" ` +
        "module, so the server holds only a reference to it and the call throws while the page " +
        "renders. Move the function to a module without the directive.",
    )
    .join("\n");
}
