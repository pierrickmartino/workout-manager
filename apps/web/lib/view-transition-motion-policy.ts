import postcss, { type AtRule, type Container, type Declaration, type Node } from "postcss";
import ts from "@typescript/typescript6";
import { isAnimationBearing, isMotionBearingTransition, parseClassToken } from "./motion-policy.ts";

// ADR-0118: movement declared in a stylesheet does not survive the reduced-motion
// preference either. ADR-0082's guard (`motion-policy.ts`) reads Tailwind class strings
// in `.tsx` files, so it cannot see the half of a view transition that lives in CSS:
// `::view-transition-*` pseudo-elements, their `@keyframes`, and the browser's own
// default cross-fade and morph, which run with no CSS at all. This module covers that
// half, in three rules:
//
//   1. The off switch exists. `app/globals.css` carries one
//      `@media (prefers-reduced-motion: reduce)` rule that sets `animation: none
//      !important` on every view-transition pseudo-element. It is required
//      unconditionally — the default animation needs no CSS to move, so "no VT CSS yet"
//      is not a reason for it to be absent.
//   2. Stylesheet movement is reachable by an off switch. An animation or a moving
//      transition sits on a view-transition pseudo-element (the switch reaches it) or
//      inside `@media (prefers-reduced-motion: no-preference)` (the stylesheet
//      `motion-safe:`). Anything else is movement nothing turns off.
//   3. Movement stays in CSS. A `<ViewTransition>` event callback (`onEnter`, …) exists
//      to run Web Animations, which no stylesheet can cancel, and reading the preference
//      in JavaScript instead is what ADR-0082 rules out.
//
// Like the other guards it proves the switch is *declared*; whether a browser honours it
// is a rendered property no offline test sees.

// The pseudo-elements the browser animates during a view transition. `::view-transition`
// itself is the overlay root and carries no animation.
export const VIEW_TRANSITION_PSEUDOS = [
  "::view-transition-group(*)",
  "::view-transition-image-pair(*)",
  "::view-transition-old(*)",
  "::view-transition-new(*)",
] as const;

// The `<ViewTransition>` props that hand the caller an instance to animate imperatively.
const VIEW_TRANSITION_CALLBACKS: ReadonlySet<string> = new Set(["onEnter", "onExit", "onUpdate", "onShare"]);

// Properties whose transition changes how something looks without moving it. A
// transition counts as movement unless every property it names is here, so a property
// nobody thought about fails closed. Mirrors `transition-colors`, `transition-opacity`
// and `transition-shadow`, which ADR-0082 exempts by rule.
const STILL_PROPERTIES: ReadonlySet<string> = new Set([
  "color", "background-color", "border-color", "outline-color", "text-decoration-color",
  "caret-color", "accent-color", "fill", "stroke", "opacity", "fill-opacity",
  "stroke-opacity", "box-shadow", "visibility",
]);

const TIMING_KEYWORDS: ReadonlySet<string> = new Set([
  "ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end",
  "allow-discrete", "normal", "initial", "inherit", "unset",
]);

// A selector whose only subject is a view-transition pseudo-element, optionally anchored
// on the root and narrowed to `:only-child` (the usual enter/exit idiom).
const VIEW_TRANSITION_SELECTOR =
  /^(?:html|:root)?::view-transition-(?:group|image-pair|old|new)\([^()]*\)(?::only-child)?$/;

export type StylesheetMotionKind = "unguarded" | "declared-under-reduce" | "outranks-off-switch";

export interface StylesheetMotionViolation {
  readonly file: string;
  readonly line: number;
  readonly selector: string;
  readonly property: string;
  readonly kind: StylesheetMotionKind;
}

export interface StylesheetMotionExemption {
  readonly file: string;
  readonly selector: string;
  readonly reason: string;
}

// Deliberately empty, as in ADR-0082: an entry asserts that a stylesheet animation must
// keep running for someone who asked for less movement, so it carries a written reason.
export const STYLESHEET_MOTION_EXEMPTIONS: readonly StylesheetMotionExemption[] = [];

export interface ViewTransitionCallbackViolation {
  readonly file: string;
  readonly line: number;
  readonly prop: string;
}

type MotionPreference = "reduce" | "no-preference" | null;

function mediaPreference(atRule: AtRule): MotionPreference {
  const params = atRule.params.toLowerCase().replace(/\s+/g, "");
  if (params.startsWith("not")) return null;
  if (params.includes("(prefers-reduced-motion:reduce)")) return "reduce";
  if (params.includes("(prefers-reduced-motion:no-preference)")) return "no-preference";
  return null;
}

function ancestorAtRules(node: Node): readonly AtRule[] {
  const found: AtRule[] = [];
  for (let parent: Container | undefined = node.parent as Container | undefined; parent; parent = parent.parent as Container | undefined) {
    if (parent.type === "atrule") found.push(parent as AtRule);
  }
  return found;
}

function preferenceOf(node: Node): MotionPreference {
  const preferences = ancestorAtRules(node)
    .filter((atRule) => atRule.name === "media")
    .map(mediaPreference);
  return preferences.find((preference) => preference !== null) ?? null;
}

function isInKeyframes(node: Node): boolean {
  return ancestorAtRules(node).some((atRule) => /keyframes$/.test(atRule.name));
}

function selectorsOf(declaration: Declaration): readonly string[] {
  const parent = declaration.parent;
  if (parent?.type !== "rule") return [];
  return (parent as postcss.Rule).selectors.map((selector) => selector.replace(/\s+/g, " ").trim());
}

function isAnimationOff(declaration: Declaration): boolean {
  return declaration.value.trim().toLowerCase() === "none";
}

// Splits at top-level commas only: `cubic-bezier(0, 0, 1, 1)` carries its own.
function topLevelSegments(value: string): readonly string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      segments.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  segments.push(current.trim());
  return segments.filter(Boolean);
}

function transitionedProperty(segment: string, isShorthand: boolean): string {
  if (!isShorthand) return segment.toLowerCase();
  const words = segment.replace(/[a-z-]+\([^()]*\)/gi, " ").split(/\s+/).filter(Boolean);
  const property = words.find((word) => !/^-?[\d.]+m?s$/i.test(word) && !TIMING_KEYWORDS.has(word.toLowerCase()));
  // A shorthand that names no property transitions `all`.
  return (property ?? "all").toLowerCase();
}

export function isMovingTransition(property: string, value: string): boolean {
  const isShorthand = property === "transition";
  return topLevelSegments(value)
    .map((segment) => transitionedProperty(segment, isShorthand))
    .some((name) => name !== "none" && !STILL_PROPERTIES.has(name));
}

function isMotionDeclaration(declaration: Declaration): boolean {
  const property = declaration.prop.toLowerCase();
  if (property === "animation" || property === "animation-name") return !isAnimationOff(declaration);
  if (property === "transition" || property === "transition-property") return isMovingTransition(property, declaration.value);
  return false;
}

function isViewTransitionRule(selectors: readonly string[]): boolean {
  return selectors.length > 0 && selectors.every((selector) => VIEW_TRANSITION_SELECTOR.test(selector));
}

function classifyDeclaration(declaration: Declaration): StylesheetMotionKind | null {
  if (isInKeyframes(declaration) || !isMotionDeclaration(declaration)) return null;
  const preference = preferenceOf(declaration);
  if (preference === "reduce") return "declared-under-reduce";
  if (preference === "no-preference") return null;
  if (!isViewTransitionRule(selectorsOf(declaration))) return "unguarded";
  const isAnimation = declaration.prop.toLowerCase().startsWith("animation");
  return isAnimation && declaration.important ? "outranks-off-switch" : null;
}

// `@apply animate-spin` puts a Tailwind utility where `motion-policy.ts` cannot read it,
// so the same pairing rule is applied to the at-rule's own token list.
function applyMotion(atRule: AtRule): readonly string[] {
  const tokens = atRule.params.split(/\s+/).filter(Boolean).map(parseClassToken);
  const hasOptOut = (utility: string): boolean =>
    tokens.some((token) => token.variants.includes("motion-reduce") && token.utility === utility);
  return tokens.filter((token) => {
    if (token.variants.includes("motion-safe")) return false;
    const guard = isAnimationBearing(token.utility) ? "animate-none"
      : isMotionBearingTransition(token.utility) ? "transition-none" : null;
    if (guard === null) return false;
    return token.variants.includes("motion-reduce") || !hasOptOut(guard);
  }).map((token) => token.utility);
}

export function findStylesheetMotion(css: string, file: string): readonly StylesheetMotionViolation[] {
  const root = postcss.parse(css, { from: file });
  const violations: StylesheetMotionViolation[] = [];
  root.walkDecls((declaration) => {
    const kind = classifyDeclaration(declaration);
    if (kind === null) return;
    violations.push({
      file,
      line: declaration.source?.start?.line ?? 0,
      selector: selectorsOf(declaration).join(", "),
      property: declaration.prop,
      kind,
    });
  });
  root.walkAtRules("apply", (atRule) => {
    const selector = atRule.parent?.type === "rule" ? (atRule.parent as postcss.Rule).selector : "";
    for (const utility of applyMotion(atRule)) {
      violations.push({ file, line: atRule.source?.start?.line ?? 0, selector, property: `@apply ${utility}`, kind: "unguarded" });
    }
  });
  return violations.filter((violation) => !STYLESHEET_MOTION_EXEMPTIONS.some((exemption) =>
    exemption.file === violation.file && exemption.selector === violation.selector));
}

// The pseudo-elements a reduced-motion `animation: none !important` rule fails to reach.
// Empty means the off switch is whole.
export function offSwitchGaps(css: string): readonly string[] {
  const covered = new Set<string>();
  postcss.parse(css).walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    if (property !== "animation" && property !== "animation-name") return;
    if (!isAnimationOff(declaration) || !declaration.important) return;
    if (preferenceOf(declaration) !== "reduce") return;
    for (const selector of selectorsOf(declaration)) covered.add(selector.replace(/^(?:html|:root)/, ""));
  });
  return VIEW_TRANSITION_PSEUDOS.filter((pseudo) => !covered.has(pseudo));
}

function isViewTransitionTag(tagName: ts.JsxTagNameExpression): boolean {
  if (ts.isIdentifier(tagName)) return tagName.text === "ViewTransition";
  return ts.isPropertyAccessExpression(tagName) && tagName.name.text === "ViewTransition";
}

export function findViewTransitionCallbacks(source: string, file: string): readonly ViewTransitionCallbackViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: ViewTransitionCallbackViolation[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && isViewTransitionTag(node.tagName)) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
        if (!VIEW_TRANSITION_CALLBACKS.has(attribute.name.text)) continue;
        violations.push({
          file,
          line: tree.getLineAndCharacterOfPosition(attribute.getStart(tree)).line + 1,
          prop: attribute.name.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return violations;
}

export function formatStylesheetMotion(violations: readonly StylesheetMotionViolation[]): string {
  const remedy: Record<StylesheetMotionKind, string> = {
    "unguarded": "move it inside @media (prefers-reduced-motion: no-preference), or onto a ::view-transition-* pseudo-element",
    "declared-under-reduce": "it moves because the preference is set; remove it",
    "outranks-off-switch": "drop !important so the reduced-motion off switch wins",
  };
  return violations.map(({ file, line, selector, property, kind }) =>
    `${file}:${line} — ${selector} { ${property} } moves under prefers-reduced-motion; ${remedy[kind]}`).join("\n");
}
