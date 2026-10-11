import ts from "@typescript/typescript6";

// ADR-0123: a skeleton dissolves into its content, and the page header never fades over itself.
//
//   - A route `loading.tsx` returns a `SkeletonPage` at its root. That component puts the header
//     in the live root (it is swapped instantly for the page's identical header) and the data
//     region in a `SkeletonReveal`, whose snapshot fades off over the real content. A skeleton
//     returning anything else simply never reveals, and nothing would notice.
//   - An in-page `<Suspense fallback={…}>` either shows nothing (`null`) or a skeleton whose root
//     is a `SkeletonReveal`, written inline or as a component declared in the same file. A
//     fallback the sweep cannot see into (an imported component) is reported too: the rule fails
//     closed rather than trusting what it cannot read.
//   - No `PageHeader` sits inside a `SkeletonReveal`. Its snapshot would composite over the
//     identical live header and visibly thicken the text for the length of the fade.

export type SkeletonRevealRule = "route-skeleton-root" | "inline-skeleton-root" | "header-in-reveal";

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

// The expressions a function component returns.
function returnRoots(body: ts.Block): readonly ts.Expression[] {
  const roots: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node) && node.expression) roots.push(unwrap(node.expression));
    // A nested function's returns are not the component's.
    if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return roots;
}

// The JSX roots a default-exported function component returns.
function defaultExportRoots(tree: ts.SourceFile): readonly ts.Expression[] {
  return tree.statements.flatMap((statement) => {
    if (!ts.isFunctionDeclaration(statement) || statement.body === undefined) return [];
    const isDefault = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    return isDefault ? returnRoots(statement.body) : [];
  });
}

// The function components declared at the top level of the file, by name.
function localComponents(tree: ts.SourceFile): ReadonlyMap<string, ts.Block> {
  return new Map(tree.statements.flatMap((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name && statement.body
      ? [[statement.name.text, statement.body] as const]
      : []));
}

function isElementNamed(expression: ts.Expression, name: string): boolean {
  return (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) && tagName(expression) === name;
}

// Whether a Suspense fallback dissolves when its content arrives (or has nothing to dissolve).
function fallbackReveals(expression: ts.Expression, components: ReadonlyMap<string, ts.Block>): boolean {
  if (expression.kind === ts.SyntaxKind.NullKeyword) return true;
  if (!ts.isJsxElement(expression) && !ts.isJsxSelfClosingElement(expression)) return false;
  if (isElementNamed(expression, "SkeletonReveal")) return true;
  const body = components.get(tagName(expression));
  if (body === undefined) return false;
  const roots = returnRoots(body);
  return roots.length > 0 && roots.every((root) => isElementNamed(root, "SkeletonReveal"));
}

// The `fallback` expressions of every `<Suspense>` in the file.
function suspenseFallbacks(tree: ts.SourceFile): readonly ts.Expression[] {
  const fallbacks: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText() === "Suspense") {
      for (const attribute of node.attributes.properties) {
        const isFallback = ts.isJsxAttribute(attribute) && attribute.name.getText() === "fallback";
        const initializer = isFallback ? attribute.initializer : undefined;
        if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
          fallbacks.push(unwrap(initializer.expression));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return fallbacks;
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

  const components = localComponents(tree);
  for (const fallback of suspenseFallbacks(tree)) {
    if (!fallbackReveals(fallback, components)) violations.push({ file, line: lineOf(fallback), rule: "inline-skeleton-root" });
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
