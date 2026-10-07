import ts from "@typescript/typescript6";

// Clerk Core 3 (`@clerk/nextjs` 7) removed the `<SignedIn>`, `<SignedOut>` and `<Protect>`
// control components in favour of `<Show when=…>`. It still exports the three names, as stubs
// that throw when rendered, so `tsc` passes and the break surfaces only at run time — in the
// root layout, on every page. This guard turns that into a test failure.
//
// It reads the AST rather than the bytes, so a comment naming `<SignedIn>` never counts.

const CLERK_MODULE = "@clerk/nextjs";

// Each removed name and what replaces it.
const REMOVED: ReadonlyMap<string, string> = new Map([
  ["SignedIn", '<Show when="signed-in">'],
  ["SignedOut", '<Show when="signed-out">'],
  ["Protect", "<Show when={…}>"],
]);

export interface ClerkImportViolation {
  readonly file: string;
  readonly line: number;
  readonly imported: string;
}

export function findClerkImportViolations(
  source: string,
  file: string,
): readonly ClerkImportViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: ClerkImportViolation[] = [];
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== CLERK_MODULE) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      // `import { Protect as Gate }` still renders Protect.
      const imported = (element.propertyName ?? element.name).text;
      if (!REMOVED.has(imported)) continue;
      violations.push({
        file,
        line: tree.getLineAndCharacterOfPosition(element.getStart(tree)).line + 1,
        imported,
      });
    }
  }
  return violations;
}

export function formatClerkImportViolations(
  violations: readonly ClerkImportViolation[],
): string {
  return violations.map(({ file, line, imported }) =>
    `${file}:${line} — <${imported}> was removed in Clerk Core 3 and throws when rendered; ` +
    `use ${REMOVED.get(imported)} from "${CLERK_MODULE}"`).join("\n");
}
