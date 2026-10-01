import ts from "typescript";

// ADR-0103: a field whose value is not a word says so. `spellCheck` appeared nowhere in
// the app, so a browser underlined every tempo code (`3-1-1`), every duration (`1:30`)
// and every equipment slug in red — and on a phone, offered to correct them.
//
// "Not a word" is a judgement a guard cannot make from a field's name, but a *placeholder
// showing a value pattern* is a signature it can read: a field whose example value is
// `mm:ss` or `3-1-1` holds no prose, and one whose example reads `Optional note (e.g.
// felt easy)` holds nothing else. So this guard sweeps the call sites whose placeholder
// is a value pattern — or which the guard cannot read at all — and asks for the
// decision. Both answers pass: `spellCheck={false}` on a code, `spellCheck` on a name a
// checker should leave alone being a different claim from silence.
//
// Out of scope by rule: `type="number"` (no browser spell-checks one) and `type="search"`,
// where `components/ui/input.tsx` derives the answer from the type for every search box
// in the app. A field with no placeholder has no signature to read, and its spelling is
// the author's call.

export type TextEntryElement = "Input" | "input" | "Textarea" | "textarea";
export type SpellCheckReason = "value pattern" | "placeholder unreadable";

export interface SpellCheckViolation {
  readonly file: string;
  readonly line: number;
  readonly element: TextEntryElement;
  // The placeholder as written, or `null` when it could not be read from the source.
  readonly placeholder: string | null;
  readonly reason: SpellCheckReason;
}

export interface SpellCheckExemption {
  readonly file: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one field is better off with the
// browser's guess than with a stated intent, which needs a reason a reviewer can weigh.
export const SPELLCHECK_EXEMPTIONS: readonly SpellCheckExemption[] = [];

const TEXT_ENTRY_ELEMENTS = new Set<string>(["Input", "input", "Textarea", "textarea"]);

// Types the question does not arise for: a number has no spelling, a search box is
// answered by the primitive, and the rest hold no typed text at all.
const OUT_OF_SCOPE_TYPES = new Set([
  "number", "search", "hidden", "checkbox", "radio", "file", "submit", "reset", "button",
  "image", "range", "color", "date", "time", "datetime-local", "month", "week",
]);

// The mask words this app writes a duration with. `mm:ss` names the shape of the value,
// not a word in it, so a placeholder built from them is still a value pattern.
const MASK_WORDS = /\b(hh|mm|ss)\b/g;

// Whether a placeholder shows a value rather than prose: digits, separators and the
// duration mask only. `3-1-1`, `0:45`, `25:00` and `mm:ss` are values; `60 kg` and
// `Optional note` are not.
export function isValuePattern(placeholder: string): boolean {
  const withoutMask = placeholder.replace(MASK_WORDS, "");
  return /[0-9:]/.test(placeholder) && !/[A-Za-z]/.test(withoutMask);
}

interface FieldAttributes {
  readonly type: string | null;
  readonly typeIsComputed: boolean;
  readonly placeholder: string | null;
  readonly hasPlaceholder: boolean;
  readonly declaresSpellCheck: boolean;
}

function readAttributes(element: ts.JsxOpeningLikeElement): FieldAttributes {
  let type: string | null = null;
  let typeIsComputed = false;
  let placeholder: string | null = null;
  let hasPlaceholder = false;
  let declaresSpellCheck = false;
  for (const attribute of element.attributes.properties) {
    // A spread may or may not carry any of them, so it declares nothing.
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
    const name = attribute.name.text;
    const initializer = attribute.initializer;
    if (name === "spellCheck") declaresSpellCheck = true;
    if (name === "type") {
      if (initializer !== undefined && ts.isStringLiteral(initializer)) type = initializer.text;
      else typeIsComputed = true;
    }
    if (name === "placeholder") {
      hasPlaceholder = true;
      if (initializer === undefined) continue;
      if (ts.isStringLiteral(initializer)) placeholder = initializer.text;
      else if (ts.isJsxExpression(initializer) && initializer.expression !== undefined
        && ts.isStringLiteralLike(initializer.expression)) {
        placeholder = initializer.expression.text;
      }
    }
  }
  return { type, typeIsComputed, placeholder, hasPlaceholder, declaresSpellCheck };
}

function reasonFor(attributes: FieldAttributes): SpellCheckReason | null {
  const { type, typeIsComputed, placeholder, hasPlaceholder, declaresSpellCheck } = attributes;
  if (declaresSpellCheck || !hasPlaceholder) return null;
  // A computed type is read as text: `type={kind}` could be the typed-Load field, which
  // holds a quantity. Only a type written out can take the field out of scope.
  if (!typeIsComputed && type !== null && OUT_OF_SCOPE_TYPES.has(type)) return null;
  if (placeholder === null) return "placeholder unreadable";
  return isValuePattern(placeholder) ? "value pattern" : null;
}

export function findUndeclaredSpellCheck(
  source: string,
  file: string,
): readonly SpellCheckViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: SpellCheckViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      if (TEXT_ENTRY_ELEMENTS.has(tag)) {
        const attributes = readAttributes(node);
        const reason = reasonFor(attributes);
        if (reason !== null) {
          violations.push({
            file,
            line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
            element: tag as TextEntryElement,
            placeholder: attributes.placeholder,
            reason,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return violations.filter((violation) =>
    !SPELLCHECK_EXEMPTIONS.some((exemption) => exemption.file === violation.file));
}

export function formatSpellCheckViolations(
  violations: readonly SpellCheckViolation[],
): string {
  return violations.map(({ file, line, element, placeholder, reason }) => {
    const subject = reason === "placeholder unreadable"
      ? "its placeholder cannot be read from the source"
      : `its placeholder "${placeholder}" shows a value, not words`;
    return `${file}:${line} — <${element}> ${subject}; declare spellCheck (ADR-0103)`;
  }).join("\n");
}
