import ts from "typescript";
import { parseClassToken, type ClassToken } from "./motion-policy.ts";

// ADR-0085: a narrow screen reaches every control without scrolling sideways.
//
// This guard checks **one** thing, because one thing is what a class string can actually
// decide: a box that CSS floors at its content's minimum width must say so deliberately.
//
//   1. `<fieldset>` without `min-w-0`. The UA stylesheet sets `min-inline-size: min-content`
//      on every fieldset, and `border-0 p-0` does not override it. A single `nowrap`
//      descendant therefore sizes the whole box to an entire exercise name — which is how the
//      Hand-Authored form reached 789px inside a 320px viewport.
//   2. An arbitrary grid track written `1fr`, which is `minmax(auto, 1fr)` and floored by its
//      content, wrapping a subtree that contains such a box or a `nowrap` value. Tailwind's
//      own `grid-cols-2` expands to `minmax(0,1fr)` and is safe; only the bracket syntax can
//      spell the floored form.
//
// **Two patterns are deliberately absent, and their absence is the point.** A `nowrap` value
// and a `shrink-0` child in a rigid row were both in this guard's first draft and both came
// out, because neither is decidable from source. `truncate` carries `overflow-hidden`, so it
// clips harmlessly unless some ancestor is itself floored at min-content — and that ancestor
// is usually in another file. Whether a row "fits" is a width question: the page header that
// started this had a perfectly wrappable title beside its rigid action, and nothing in its
// classes distinguishes it from dozens of correct rows. A guard that flagged them produced 77
// findings, nearly all false, which is a guard that teaches people to add exemptions.
//
// **What this proves, and what it does not.** It proves min-content-floored boxes are
// declared. It does not prove a page fits: layout is a rendered property and no amount of
// reading class strings establishes it. `audit/reflow.mjs` measures the rendered result at
// 320px, and it is the only thing that can enforce the header and value rules. ADR-0085
// records the split, as ADR-0084 does for chart values.
//
// Given one file's text it returns the violations it declares. Walking the component tree is
// the caller's job (see the test), which keeps this module pure.

export interface ReflowExemption {
  readonly file: string;
  readonly line: number;
  readonly kind: ReflowViolation["kind"];
  readonly reason: string;
}

// An entry asserts that a box may be floored at its content's minimum width, so the reason is
// a required field rather than a comment. Deliberately empty, like ADR-0082's and ADR-0083's:
// every box this guard flagged was fixed, because `min-w-0` on a `fieldset` costs nothing and
// a floored grid track has a safe spelling. The drag overlays and formatted stat values that
// an earlier, broader draft of this guard would have required exemptions for are no longer
// findings at all — see the note above on why those patterns came out.
export const REFLOW_EXEMPTIONS: readonly ReflowExemption[] = [];

export type ReflowViolation =
  | { readonly kind: "fieldset-min-width"; readonly file: string; readonly line: number; readonly detail: string }
  | { readonly kind: "content-floored-grid"; readonly file: string; readonly line: number; readonly detail: string };

// Utilities that make an element refuse to shrink its inline size.
const NOWRAP_UTILITIES = new Set(["truncate", "whitespace-nowrap", "text-nowrap"]);

export function isNowrapUtility(utility: string): boolean {
  return NOWRAP_UTILITIES.has(utility);
}

// A grid track list is content-floored when it names a bare `fr` unit: `1fr` means
// `minmax(auto, 1fr)`, whose floor is the content's min-content size. `minmax(0,1fr)` is the
// spelling that can actually shrink. Tailwind's own `grid-cols-2` already expands to the
// safe form, so only the arbitrary bracket syntax is inspected here.
export function contentFlooredTracks(utility: string): readonly string[] {
  const match = utility.match(/^grid-cols-\[(.+)]$/);
  if (!match) return [];
  return match[1]
    .split("_")
    .filter((track) => /^[\d.]+fr$/.test(track));
}

interface Element {
  readonly tag: string;
  readonly line: number;
  readonly tokens: readonly ClassToken[];
  readonly children: readonly Element[];
  // Whether this element has a JSX expression child that is not a plain string — the
  // signature of text the author does not control the width of.
  readonly hasInterpolatedText: boolean;
}

function attributes(node: ts.JsxOpeningLikeElement): ts.JsxAttributes {
  return node.attributes;
}

// Every string literal inside `className`, including the branches of a `cn(...)` call, in one
// set. A conditional branch is still a class the element can carry, so treating them as one
// set is the fail-closed reading.
function classTokens(node: ts.JsxOpeningLikeElement): readonly ClassToken[] {
  const attribute = attributes(node).properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === "className",
  );
  if (!attribute?.initializer) return [];
  const literals: string[] = [];
  const visit = (current: ts.Node): void => {
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)
      || ts.isTemplateHead(current) || ts.isTemplateMiddle(current) || ts.isTemplateTail(current)) {
      literals.push(current.text);
    }
    ts.forEachChild(current, visit);
  };
  visit(attribute.initializer);
  return literals.flatMap((literal) => literal.split(/\s+/).filter(Boolean).map(parseClassToken));
}

// Every utility an element can carry, variants flattened. Correct for spotting a **hazard**,
// where flattening fails closed: a `sm:grid-cols-[1fr_4rem]` is a floored track somewhere, and
// naming it costs nothing.
function utilities(tokens: readonly ClassToken[]): ReadonlySet<string> {
  return new Set(tokens.map((token) => token.utility));
}

// Only the utilities that apply **unconditionally**. This is the set a **remedy** must come
// from, where flattening would fail open: the guarded width is 320px, every min-width
// breakpoint is inactive there — more so at 200% text, since Tailwind's breakpoints are in
// `rem` — so a `sm:min-w-0` is no escape hatch on the one screen this rule protects. A state
// variant (`hover:`, `focus:`) is conditional for the same reason.
function unconditional(tokens: readonly ClassToken[]): ReadonlySet<string> {
  return new Set(tokens.filter((token) => token.variants.length === 0).map((token) => token.utility));
}

function subtree(element: Element): readonly Element[] {
  return [element, ...element.children.flatMap(subtree)];
}

// Utilities that let a box be narrower than its content, so pressure from a sibling or a
// descendant has somewhere to go. `min-w-0` removes the automatic minimum; the flex sizing
// utilities give the box a basis it is willing to shrink from; `overflow-hidden` clips.
const SHRINKABLE = new Set([
  "min-w-0", "flex-1", "flex-auto", "basis-0", "grow", "overflow-hidden", "overflow-x-hidden",
  "overflow-auto", "overflow-x-auto", "overflow-scroll", "overflow-x-scroll",
]);

// A remedy, so it reads the unconditional set: a `sm:min-w-0` does not let this box shrink at
// the width the rule protects.
function canShrink(element: Element): boolean {
  return [...unconditional(element.tokens)].some((utility) => SHRINKABLE.has(utility));
}

// Parse one file into the JSX elements it renders, keeping the nesting, the class tokens and
// whether each element interpolates its text.
export function collectElements(source: string, file: string): readonly Element[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const roots: Element[] = [];
  const build = (node: ts.Node): readonly Element[] => {
    const found: Element[] = [];
    ts.forEachChild(node, (child) => {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        const opening = ts.isJsxElement(child) ? child.openingElement : child;
        const tagNode = opening.tagName;
        const jsxChildren = ts.isJsxElement(child) ? child.children : ts.factory.createNodeArray<ts.JsxChild>([]);
        found.push({
          tag: tagNode.getText(tree),
          line: tree.getLineAndCharacterOfPosition(opening.getStart(tree)).line + 1,
          tokens: classTokens(opening),
          hasInterpolatedText: jsxChildren.some(
            (jsxChild) => ts.isJsxExpression(jsxChild) && jsxChild.expression !== undefined
              && !ts.isStringLiteral(jsxChild.expression),
          ),
          children: build(child),
        });
        return;
      }
      found.push(...build(child));
    });
    return found;
  };
  roots.push(...build(tree));
  return roots;
}

export function findReflowViolations(source: string, file: string): readonly ReflowViolation[] {
  // Each element is visited with the chain above it, because whether an unshrinkable leaf can
  // widen anything is decided by its ancestors, never by the leaf alone. The chain stops at
  // the file boundary: a component whose shrinkable ancestor lives in its caller is not
  // decidable here, and `audit/reflow.mjs` is what covers that.
  const walk = (element: Element, ancestors: readonly Element[]): readonly { element: Element; ancestors: readonly Element[] }[] =>
    [{ element, ancestors }, ...element.children.flatMap((child) => walk(child, [...ancestors, element]))];
  const visited = collectElements(source, file).flatMap((root) => walk(root, []));
  const violations: ReflowViolation[] = [];
  for (const { element, ancestors } of visited) {
    const set = utilities(element.tokens);

    if (element.tag === "fieldset" && !unconditional(element.tokens).has("min-w-0")) {
      violations.push({
        kind: "fieldset-min-width", file, line: element.line,
        detail: "a <fieldset> inherits `min-inline-size: min-content` from the UA stylesheet; add an unconditional `min-w-0`",
      });
    }

    const tracks = [...set].flatMap(contentFlooredTracks);
    if (tracks.length > 0) {
      // A floored track only bites when something inside it refuses to give: a `nowrap` value
      // the author does not control the width of, or another min-content-floored box.
      const risky = subtree(element).some((descendant) => {
        const descendantSet = utilities(descendant.tokens);
        return ([...descendantSet].some(isNowrapUtility) && descendant.hasInterpolatedText
          && !canShrink(descendant)) || descendant.tag === "fieldset";
      });
      if (risky) {
        violations.push({
          kind: "content-floored-grid", file, line: element.line,
          detail: `track(s) \`${tracks.join(" ")}\` are \`minmax(auto,1fr)\` over content that cannot shrink; use \`minmax(0,1fr)\``,
        });
      }
    }
  }
  return violations;
}

export function isExempt(violation: ReflowViolation, exemptions: readonly ReflowExemption[]): boolean {
  return exemptions.some((exemption) =>
    exemption.file === violation.file && exemption.line === violation.line && exemption.kind === violation.kind);
}

export function formatReflowViolations(violations: readonly ReflowViolation[]): string {
  return violations
    .map((violation) => `${violation.file}:${violation.line} [${violation.kind}] ${violation.detail}`)
    .join("\n");
}
