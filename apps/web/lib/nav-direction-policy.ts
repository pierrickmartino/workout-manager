import ts from "@typescript/typescript6";

// ADR-0121: a navigation is tagged only by spreading `NAV_FORWARD` / `NAV_BACK`. A
// `transitionTypes` prop written by hand bypasses the DOM attribute the navigation guard
// reads, and a typo in it matches no key of the route transition's map, so the link
// silently stops animating. Given one file's text, this returns each hand-written use.

export interface HandWrittenTransitionTypes {
  readonly file: string;
  readonly line: number;
}

export function findHandWrittenTransitionTypes(source: string, file: string): readonly HandWrittenTransitionTypes[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: HandWrittenTransitionTypes[] = [];
  const visit = (node: ts.Node): void => {
    const isAttribute = ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "transitionTypes";
    const isProperty = ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "transitionTypes";
    if (isAttribute || isProperty) {
      found.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}
