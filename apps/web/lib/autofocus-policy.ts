import ts from "@typescript/typescript6";

// ADR-0103: nothing takes focus on arrival. `autoFocus` is defensible on a desktop screen
// whose single reason to exist is one field; this is a mobile-first PWA, and the one place
// it had crept in was an inline rename field inside a disclosure panel — so opening "More
// actions" raised the keyboard and scrolled the panel out from under the thumb that had
// just tapped it.
//
// The guard reports the attribute wherever it appears, including bound to a condition
// (`autoFocus={isDesktop}`): a viewport-gated focus is a decision worth discussing in
// review, not one to let through unseen. It says nothing about managed focus — a dialog
// that focuses itself on open and restores the opener on close (`lib/use-modal-focus.ts`)
// is answering the reader's own action, which is the opposite case.

export interface AutoFocusViolation {
  readonly file: string;
  readonly line: number;
  // The tag it was written on, so the message names the control rather than the file.
  readonly element: string;
}

export interface AutoFocusExemption {
  readonly file: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one screen is better off moving the
// reader's focus for them, which needs a reason a reviewer can weigh — so the reason is
// a required field, not a comment.
export const AUTOFOCUS_EXEMPTIONS: readonly AutoFocusExemption[] = [];

export function findAutoFocus(source: string, file: string): readonly AutoFocusViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: AutoFocusViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const declared = node.attributes.properties.some((attribute) =>
        ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name)
        && attribute.name.text === "autoFocus");
      if (declared) {
        violations.push({
          file,
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          element: node.tagName.getText(tree),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return violations.filter((violation) =>
    !AUTOFOCUS_EXEMPTIONS.some((exemption) => exemption.file === violation.file));
}

export function formatAutoFocusViolations(
  violations: readonly AutoFocusViolation[],
): string {
  return violations.map(({ file, line, element }) =>
    `${file}:${line} — <${element}> takes focus on arrival; drop autoFocus — on a phone it `
    + `raises the keyboard over the surface the reader just opened (ADR-0103)`).join("\n");
}
