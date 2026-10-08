import ts from "@typescript/typescript6";

// ADR-0123: a skeleton dissolves into its content, and the page header never fades over itself.
//
//   - A route `loading.tsx` returns a `SkeletonPage` at its root. That component puts the header
//     in the live root (it is swapped instantly for the page's identical header) and the data
//     region in a `SkeletonReveal`, whose snapshot fades off over the real content. A skeleton
//     returning anything else simply never reveals, and nothing would notice.
//   - No `PageHeader` sits inside a `SkeletonReveal`. Its snapshot would composite over the
//     identical live header and visibly thicken the text for the length of the fade.

export type SkeletonRevealRule = "route-skeleton-root" | "header-in-reveal";

export interface SkeletonRevealViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: SkeletonRevealRule;
}

function isRouteSkeleton(file: string): boolean {
  return file === "app/loading.tsx" || (file.startsWith("app/") && file.endsWith("/loading.tsx"));
}

function tagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
}

// The JSX roots a default-exported function component returns.
function defaultExportRoots(tree: ts.SourceFile): readonly ts.Expression[] {
  const roots: ts.Expression[] = [];
  for (const statement of tree.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.body === undefined) continue;
    const isDefault = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (!isDefault) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression) roots.push(unwrap(node.expression));
      // A nested function's returns are not the component's.
      if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
    };
    ts.forEachChild(statement.body, visit);
  }
  return roots;
}

export function findSkeletonRevealViolations(source: string, file: string): readonly SkeletonRevealViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineOf = (node: ts.Node): number => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  const violations: SkeletonRevealViolation[] = [];

  if (isRouteSkeleton(file)) {
    for (const root of defaultExportRoots(tree)) {
      const isSkeletonPage = (ts.isJsxElement(root) || ts.isJsxSelfClosingElement(root)) && tagName(root) === "SkeletonPage";
      if (!isSkeletonPage) violations.push({ file, line: lineOf(root), rule: "route-skeleton-root" });
    }
  }

  const visit = (node: ts.Node, insideReveal: boolean): void => {
    const isElement = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
    const name = isElement ? tagName(node) : null;
    if (name === "PageHeader" && insideReveal) violations.push({ file, line: lineOf(node), rule: "header-in-reveal" });
    ts.forEachChild(node, (child) => visit(child, insideReveal || name === "SkeletonReveal"));
  };
  visit(tree, false);
  return violations;
}
