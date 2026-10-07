import ts from "@typescript/typescript6";

// ADR-0093: autofill and the on-screen keypad are declared by the design system's form
// primitives, so a call site gets them by using `<Input>` / `<Select>` / `<Textarea>`.
// This guard watches the other path — a component that hand-rolls a native `<input>`,
// `<select>` or `<textarea>` and so bypasses the defaults. 122 controls once shared one
// bug (no `autocomplete` anywhere, and `inputmode` on exactly one field); the primitive
// fixes them all at once and this keeps the next control from drifting back out.
//
// It proves the attribute is *declared*, not that the value is right: `autoComplete="name"`
// on a Load field would pass. What the primitive renders is asserted by rendering it, in
// `form-affordances.test.ts`.

export type FormControlElement = "input" | "select" | "textarea";
export type FormControlAttribute = "autoComplete" | "inputMode";

export interface FormControlViolation {
  readonly file: string;
  readonly line: number;
  readonly element: FormControlElement;
  readonly attribute: FormControlAttribute;
}

export interface FormControlExemption {
  readonly file: string;
  readonly attribute: FormControlAttribute;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one control is better off with the
// browser's guess than with a stated intent, which needs a reason a reviewer can weigh —
// so the reason is a required field, not a comment.
export const FORM_CONTROL_EXEMPTIONS: readonly FormControlExemption[] = [];

const CONTROL_ELEMENTS = new Set<string>(["input", "select", "textarea"]);

// Input types a browser never offers to autofill and whose keyboard is not a keyboard: a
// value the user cannot type, a boolean, a picker, a button. Everything else — including a
// field with no `type` at all, which is a text field — has autofill behaviour worth stating.
const NO_AUTOFILL_TYPES = new Set([
  "hidden", "checkbox", "radio", "file", "submit", "reset", "button", "image", "range", "color",
]);

interface ControlAttributes {
  readonly type: string | null;
  // True when the type is present but not a plain string — a computed type could be `text`.
  readonly typeIsComputed: boolean;
  readonly declared: ReadonlySet<string>;
}

function readAttributes(element: ts.JsxOpeningLikeElement): ControlAttributes {
  const declared = new Set<string>();
  let type: string | null = null;
  let typeIsComputed = false;
  for (const attribute of element.attributes.properties) {
    // A spread may or may not carry the attribute, so it declares nothing.
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
    declared.add(attribute.name.text);
    if (attribute.name.text !== "type") continue;
    const initializer = attribute.initializer;
    if (initializer !== undefined && ts.isStringLiteral(initializer)) type = initializer.text;
    else typeIsComputed = true;
  }
  return { type, typeIsComputed, declared };
}

function missingAttributes(
  element: FormControlElement,
  { type, typeIsComputed, declared }: ControlAttributes,
): readonly FormControlAttribute[] {
  const missing: FormControlAttribute[] = [];
  // Both questions fail closed on a type the guard cannot evaluate: `type={kind}` could be
  // `text`, which autofills, or `number`, which needs a keypad. Stating the attribute is the
  // way out either way.
  const autofillable = element !== "input" || typeIsComputed
    || type === null || !NO_AUTOFILL_TYPES.has(type);
  const numberLike = element === "input" && (type === "number" || typeIsComputed);
  if (autofillable && !declared.has("autoComplete")) missing.push("autoComplete");
  if (numberLike && !declared.has("inputMode")) missing.push("inputMode");
  return missing;
}

export function findUndeclaredFormControls(
  source: string,
  file: string,
): readonly FormControlViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: FormControlViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      // Only the lowercase element is the raw control; `<Input>` is the primitive.
      if (CONTROL_ELEMENTS.has(tag)) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        for (const attribute of missingAttributes(tag as FormControlElement, readAttributes(node))) {
          violations.push({ file, line, element: tag as FormControlElement, attribute });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return violations.filter((violation) => !FORM_CONTROL_EXEMPTIONS.some((exemption) =>
    exemption.file === violation.file && exemption.attribute === violation.attribute));
}

export function formatFormControlViolations(
  violations: readonly FormControlViolation[],
): string {
  return violations.map(({ file, line, element, attribute }) => {
    const remedy = attribute === "autoComplete"
      ? "state autoComplete, or render it through components/ui/input.tsx, select.tsx or textarea.tsx"
      : "state inputMode, or render it through components/ui/input.tsx, which derives it from the step";
    return `${file}:${line} — <${element}> declares no ${attribute}; ${remedy}`;
  }).join("\n");
}
