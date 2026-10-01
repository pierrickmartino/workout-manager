import ts from "typescript";

// The one AST walk the import guards share.
//
// `recharts-import-policy` and `icon-import-policy` both answer a question of the same
// shape — "which modules does this file name, where, and how" — and both must read the tree
// rather than the bytes, so a specifier inside a comment, a string, or a
// `dynamic(() => import(…))` callback never counts. That last exclusion is the whole
// distinction ADR-0090 rests on: a dynamic import is a call expression, not a declaration,
// so it is absent from this list by construction rather than by filtering.
//
// Each guard then applies its own rule to the same list. They disagree on what counts, and
// both are right for their own concern: a type-only import costs no bytes (so ADR-0090
// exempts it) but still couples a module to a package (so ADR-0092 does not), and a
// re-export is a loophole only for the rule about *naming* a package. Those are policy
// decisions, which is why this module makes none of them.

export interface ModuleSpecifier {
  // The specifier exactly as written, so a deep import reads as itself.
  readonly specifier: string;
  readonly line: number;
  // `import type { … }` / `export type { … }` — erased before the bundler sees it.
  readonly isTypeOnly: boolean;
  // `export { … } from "…"` rather than an import.
  readonly isReExport: boolean;
}

// Every static `import … from "…"` and `export … from "…"` in this file, in source order.
export function moduleSpecifiers(source: string, file: string): readonly ModuleSpecifier[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ModuleSpecifier[] = [];
  for (const statement of tree.statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isReExport = ts.isExportDeclaration(statement);
    if (!isImport && !isReExport) continue;
    const specifier = statement.moduleSpecifier;
    // A bare `export { x }` re-exports a local binding and names no module.
    if (specifier === undefined || !ts.isStringLiteral(specifier)) continue;
    found.push({
      specifier: specifier.text,
      line: tree.getLineAndCharacterOfPosition(statement.getStart(tree)).line + 1,
      isTypeOnly: isImport
        ? statement.importClause?.isTypeOnly === true
        : statement.isTypeOnly,
      isReExport,
    });
  }
  return found;
}
