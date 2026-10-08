import ts from "@typescript/typescript6";

// ADR-0114: every Load value field says what it is in and what an empty value means, for the
// kind currently picked. That answer is `loadValueHint`, rendered by `LoadValueInput`. A field
// written by hand drifts: the plan-side Load field showed `60 kg` for all five kinds — a "kg"
// on a percentage, a number on a descriptive Load — long after the log table learned better.
//
// The signature a guard can read is the keypad: one input serves all five kinds, so every Load
// value field asks `loadValueInputMode` for its keyboard (ADR-0093). A call to it outside the
// shared field is a Load value field that is not getting the shared hint.

export interface LoadValueViolation {
  readonly file: string;
  readonly line: number;
  // The enclosing component, which is what an exemption names — a file can hold one field that
  // is exempt and another that is not.
  readonly component: string;
}

export interface LoadValueExemption {
  readonly file: string;
  readonly component: string;
  readonly reason: string;
}

// An entry asserts that one field is better off with a placeholder of its own, which needs a
// reason a reviewer can weigh.
export const LOAD_VALUE_EXEMPTIONS: readonly LoadValueExemption[] = [
  {
    file: "components/pulse/set-entry.tsx",
    component: "SetEntryLoad",
    reason:
      "The stacked log forms' Load field takes a caller-chosen placeholder (`70`, `0`, `15`); "
      + "moving it to the kind-aware hint changes `SetEntry.Load`'s API and is tracked as its "
      + "own item in TASKS.md.",
  },
];

// The module that renders the field by hand so no one else has to. A guard has to be able to
// spell its own subject.
const DEFINING_MODULE = "components/pulse/load-value-input.tsx";

const KEYPAD_CALL = "loadValueInputMode";

function isKeypadAttribute(attribute: ts.JsxAttributeLike, tree: ts.SourceFile): boolean {
  if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) return false;
  if (attribute.name.text !== "inputMode") return false;
  const initializer = attribute.initializer;
  if (initializer === undefined || !ts.isJsxExpression(initializer)) return false;
  const expression = initializer.expression;
  return expression !== undefined
    && ts.isCallExpression(expression)
    && expression.expression.getText(tree) === KEYPAD_CALL;
}

// The nearest named function or function-valued variable above the field.
function enclosingComponent(node: ts.Node): string {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) return current.name.text;
    if (
      ts.isVariableDeclaration(current)
      && ts.isIdentifier(current.name)
      && current.initializer !== undefined
      && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      return current.name.text;
    }
  }
  return "(module)";
}

export function findLoadValueFields(
  source: string,
  file: string,
  exemptions: readonly LoadValueExemption[] = LOAD_VALUE_EXEMPTIONS,
): readonly LoadValueViolation[] {
  if (file === DEFINING_MODULE) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: LoadValueViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.attributes.properties.some((attribute) => isKeypadAttribute(attribute, tree))
    ) {
      violations.push({
        file,
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        component: enclosingComponent(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return violations.filter((violation) => !exemptions.some((exemption) =>
    exemption.file === violation.file && exemption.component === violation.component));
}

export function formatLoadValueViolations(violations: readonly LoadValueViolation[]): string {
  return violations.map(({ file, line, component }) =>
    `${file}:${line} — ${component} writes a Load value field by hand; render LoadValueInput `
    + "so the placeholder and unit follow the picked kind (ADR-0114)").join("\n");
}
