import ts from "typescript";

// #8: three irreversible actions — deleting a Logged Session, the admin hard delete, and the
// Protocol supersede one-way door — asked for confirmation with `window.confirm`.
//
// That is not a styling complaint. A browser dialog is chrome: it ignores the Skin, it is
// not the focus trap `lib/use-modal-focus.ts` provides, and after the first one a browser
// offers "prevent additional dialogs" — once ticked, every later `confirm` returns without
// asking, so the guard becomes a standing yes or a standing no with nothing on screen to say
// which. `components/pulse/confirm-dialog.tsx` is the app's answer, and this guard keeps the
// cheaper one from creeping back.
//
// Read from the AST rather than by searching the text, so a component may explain in a
// comment why it does not use `window.confirm` without tripping the rule it is documenting.

export type NativeDialog = "alert" | "confirm" | "prompt";

export interface NativeDialogCall {
  readonly file: string;
  readonly line: number;
  readonly dialog: NativeDialog;
}

const DIALOGS: ReadonlySet<string> = new Set<NativeDialog>(["alert", "confirm", "prompt"]);

// The dialog a call expression invokes, or null when it is not one of the browser's. Both
// `confirm(…)` and `window.confirm(…)` reach the same dialog; `wizard.confirm(…)` is some
// other object's method and none of this rule's business.
function dialogCalled(call: ts.CallExpression, tree: ts.SourceFile): NativeDialog | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee) && DIALOGS.has(callee.text)) {
    return callee.text as NativeDialog;
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.name) &&
    DIALOGS.has(callee.name.text) &&
    ["window", "globalThis", "self"].includes(callee.expression.getText(tree))
  ) {
    return callee.name.text as NativeDialog;
  }
  return null;
}

export function findNativeDialogCalls(
  source: string,
  file: string,
): readonly NativeDialogCall[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: NativeDialogCall[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const dialog = dialogCalled(node, tree);
      if (dialog !== null) {
        calls.push({
          file,
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          dialog,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

export function formatNativeDialogCalls(
  calls: readonly NativeDialogCall[],
): string {
  return calls
    .map(
      ({ file, line, dialog }) =>
        `${file}:${line} — window.${dialog} asks in browser chrome, which ignores the Skin ` +
        "and can be suppressed for the rest of the page: use " +
        "components/pulse/confirm-dialog.tsx.",
    )
    .join("\n");
}
