import ts from "typescript";

// #9: a touch browser holds a tap for ~300ms to see whether a second one is coming
// (double-tap zoom) before it dispatches the click. `touch-action: manipulation` gives up
// that gesture and nothing else, so the tap lands immediately while panning and pinch-zoom
// keep working. The app declared it nowhere, on a PWA whose point is logging sets mid-effort.
//
// The remedy is one base rule in `app/globals.css` over the elements a finger actually
// presses. This guard watches the two ways that rule can stop being true:
//
//   1. The rule is edited away, or loses an element type. `tapActionSelectors` returns the
//      selector list it actually declares, so a test can hold it to the native controls
//      rather than to a copy of the stylesheet's own text.
//   2. A component renders something tappable that no selector reaches — an ARIA widget role
//      on a `<div>`, the usual way a tap target escapes an element-name rule.
//
// It proves the declaration *reaches* every tap target, not that a tap feels fast: that is a
// property of a device, and no offline test can see it.

// The elements the rule must name because a finger presses them directly. Not an exhaustive
// list of HTML's interactive elements — these are the ones this app renders.
export const NATIVE_TAP_TARGETS: readonly string[] = [
  "a",
  "button",
  "summary",
  "input",
  "select",
  "textarea",
];

// ARIA roles that make their element a control. A role that merely names a region or
// announces something (`alert`, `status`, `group`, `img`, `dialog`, `presentation`) is read,
// never tapped, so it is not this rule's business.
const WIDGET_ROLES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "tab",
]);

// A component that puts a role on something other than its own markup, mapped to the element
// it renders. `next/link` renders an `<a>`, so `<Link role="tab">` is an anchor with a role
// and the rule reaches it. Anything else capitalized fails closed: a component's root element
// is not decidable from the call site, and guessing would be the one answer that hides a
// `<div>` behind a friendly name.
const COMPONENT_ELEMENTS: Readonly<Record<string, string>> = { Link: "a" };

export interface TapTargetViolation {
  readonly file: string;
  readonly line: number;
  readonly element: string;
  readonly role: string;
}

// Strip CSS comments so a comment above the rule is never read as part of its selector list.
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// The selectors of every rule declaring `touch-action: manipulation`, flattened into one
// list. An empty result means the stylesheet declares it nowhere — which is a finding, not a
// pass: a caller sweeping against an empty covered set would otherwise accept everything.
export function tapActionSelectors(css: string): readonly string[] {
  const selectors: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const [, selectorList, body] of withoutComments(css).matchAll(rule)) {
    if (!/touch-action:\s*manipulation/.test(body)) continue;
    for (const selector of selectorList.split(",")) {
      const trimmed = selector.trim();
      if (trimmed.length > 0) selectors.push(trimmed);
    }
  }
  return selectors;
}

// The literal value of a JSX attribute, or null when it is computed — a `role={expr}` could
// be anything, so it is not read as a widget role here. The elements in this app all spell
// their role out.
function literalAttribute(
  element: ts.JsxOpeningLikeElement,
  name: string,
): string | null {
  for (const attribute of element.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
    if (attribute.name.text !== name) continue;
    const { initializer } = attribute;
    if (initializer && ts.isStringLiteral(initializer)) return initializer.text;
    return null;
  }
  return null;
}

// Every element carrying a widget role that neither its tag name nor `[role="…"]` is covered
// for. A role written on a component tag is resolved through `COMPONENT_ELEMENTS` and
// otherwise reported, since what that component renders is not readable here.
export function findUncoveredTapTargets(
  source: string,
  file: string,
  covered: readonly string[],
): readonly TapTargetViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reach = new Set(covered);
  const violations: TapTargetViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      const element = COMPONENT_ELEMENTS[tag] ?? tag;
      const role = literalAttribute(node, "role");
      if (
        role !== null &&
        WIDGET_ROLES.has(role) &&
        !reach.has(element) &&
        !reach.has(`[role="${role}"]`)
      ) {
        violations.push({
          file,
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          element,
          role,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return violations;
}

export function formatTapTargetViolations(
  violations: readonly TapTargetViolation[],
): string {
  return violations
    .map(
      ({ file, line, element, role }) =>
        `${file}:${line} — <${element} role="${role}"> is tapped but no touch-action rule ` +
        "reaches it: render it as a native control, or add its selector to the base rule in " +
        "app/globals.css.",
    )
    .join("\n");
}
