import ts from "typescript";

// ADR-0082: movement does not survive the reduced-motion preference. Tailwind
// declares motion at the call site, so the rule is a source property and this
// module reads source. Given one file's text it returns the class tokens that
// move without an opt-out; walking the tree is the caller's job (see
// motion-policy.test.ts), which keeps this module pure and unit-testable.
//
// Colour and opacity are not motion. A 150ms hover tint or a cross-fade moves
// nothing, so `transition-colors` and `transition-opacity` are exempt by rule
// rather than by allowlist — that is the decision most likely to be mistaken for
// an oversight, and ADR-0082 records why it is not.

export type MotionKind = "animation" | "transition";

export interface MotionViolation {
  readonly file: string;
  readonly line: number;
  readonly utility: string;
  readonly kind: MotionKind;
}

export interface MotionExemption {
  readonly file: string;
  readonly utility: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that a specific animation must keep
// running for a user who asked for less movement, which needs a reason a
// reviewer can weigh — so the reason is a required field, not a comment.
export const MOTION_EXEMPTIONS: readonly MotionExemption[] = [];

export interface ClassToken {
  readonly variants: readonly string[];
  readonly utility: string;
}

// Utilities whose transition-property list includes a movement property.
const MOTION_PROPERTIES = ["transform", "translate", "scale", "rotate"] as const;

// Callees whose string arguments are always class strings. Used to decide
// whether a bare `transition` token is a utility or the English word.
const CLASS_BUILDERS = new Set(["cn", "clsx", "cva", "twMerge"]);

// Tailwind variants are colon-separated, but arbitrary values carry their own
// colons (`bg-[url(a:b)]`), so split only at bracket depth zero.
export function parseClassToken(token: string): ClassToken {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of token) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth -= 1;
    if (char === ":" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] };
}

export function isAnimationBearing(utility: string): boolean {
  return utility.startsWith("animate-") && utility !== "animate-none";
}

export function isMotionBearingTransition(utility: string): boolean {
  // Bare `transition` and `transition-all` both include transform in their
  // property list, so both move.
  if (utility === "transition" || utility === "transition-all") return true;
  if (utility === "transition-transform") return true;
  const arbitrary = /^transition-\[(.+)]$/.exec(utility);
  return arbitrary !== null && MOTION_PROPERTIES.some((property) => arbitrary[1].includes(property));
}

interface ClassString {
  readonly text: string;
  readonly line: number;
  // True inside a `className` attribute or a class-builder call, where a bare
  // `transition` token cannot be prose.
  readonly isClassContext: boolean;
}

// Collects every string and template literal, noting which sit in a class
// context. Comments are not literals, so prose about `prefers-reduced-motion`
// never reaches the rule — the reason this reads TypeScript rather than bytes.
function collectClassStrings(source: string, file: string): readonly ClassString[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ClassString[] = [];
  const visit = (node: ts.Node, isClassContext: boolean): void => {
    const entered = isClassContext || isClassContextNode(node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push({
        text: node.text,
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        isClassContext: entered,
      });
    }
    ts.forEachChild(node, (child) => visit(child, entered));
  };
  ts.forEachChild(tree, (child) => visit(child, false));
  return found;
}

function isClassContextNode(node: ts.Node): boolean {
  if (ts.isJsxAttribute(node)) return ts.isIdentifier(node.name) && node.name.text === "className";
  if (ts.isCallExpression(node)) return ts.isIdentifier(node.expression) && CLASS_BUILDERS.has(node.expression.text);
  return false;
}

// A pairing must sit in the same literal as the utility it guards, so a reader
// sees the opt-out next to the movement instead of hunting for it.
function hasGuard(tokens: readonly ClassToken[], guarded: string): boolean {
  return tokens.some((token) => token.variants.includes("motion-reduce") && token.utility === guarded);
}

export function findUnguardedMotion(source: string, file: string): readonly MotionViolation[] {
  const violations: MotionViolation[] = [];
  for (const { text, line, isClassContext } of collectClassStrings(source, file)) {
    const tokens = text.split(/\s+/).filter(Boolean).map(parseClassToken);
    const animationGuarded = hasGuard(tokens, "animate-none");
    const transitionGuarded = hasGuard(tokens, "transition-none");
    for (const token of tokens) {
      const isBareTransition = token.utility === "transition";
      if (isBareTransition && !isClassContext) continue;
      const kind: MotionKind | null = isAnimationBearing(token.utility) ? "animation"
        : isMotionBearingTransition(token.utility) ? "transition" : null;
      if (kind === null) continue;
      // `motion-safe:` already scopes the movement to users who accept it.
      if (token.variants.includes("motion-safe")) continue;
      // `motion-reduce:animate-spin` moves *because* the preference is set, so no
      // pairing in the same literal can redeem it.
      const declaredUnderReduce = token.variants.includes("motion-reduce");
      const guarded = kind === "animation" ? animationGuarded : transitionGuarded;
      if (guarded && !declaredUnderReduce) continue;
      violations.push({ file, line, utility: token.utility, kind });
    }
  }
  return violations.filter((violation) => !MOTION_EXEMPTIONS.some((exemption) =>
    exemption.file === violation.file && exemption.utility === violation.utility));
}

export function formatMotionViolations(violations: readonly MotionViolation[]): string {
  return violations.map(({ file, line, utility, kind }) => {
    const pairing = kind === "animation" ? "motion-reduce:animate-none" : "motion-reduce:transition-none";
    return `${file}:${line} — ${utility} moves under prefers-reduced-motion; pair it with ${pairing}`;
  }).join("\n");
}
