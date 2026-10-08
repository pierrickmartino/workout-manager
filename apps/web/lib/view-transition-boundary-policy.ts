import postcss from "postcss";
import ts from "@typescript/typescript6";
import { missingDeclarations } from "./persistent-transition-policy.ts";

// ADR-0120: a `<ViewTransition>` animates only what it names, and the page itself never
// fades. Nearly every Transition in this app is a server action, not a navigation
// (view-transitions audit §2), and a bare boundary cross-fades on every one of them. So the
// safe shape has to be the only shape:
//
//   - Every boundary says `default="none"` as a literal, so a revalidation, a deferred
//     filter or a Suspense resolve cannot fade it. Animation is opted into per trigger.
//   - A boundary with a `name` says `share`, because `default="none"` resolves an
//     unspecified share to none and the morph would silently never run.
//   - Every class a boundary names is styled in `app/globals.css`. A typo'd class is
//     otherwise the browser's default animation, which is not what anyone chose.
//   - The root is live: `::view-transition-old(root)` is hidden and `-new(root)` doesn't
//     animate. Otherwise every morph would also cross-fade the whole unnamed page.

export type BoundaryRule = "default-none" | "named-without-share";

export interface BoundaryViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: BoundaryRule;
}

export interface BoundaryExemption {
  readonly file: string;
  readonly reason: string;
}

// Deliberately empty. A later keyed list item that wants `update` left on (the skill's
// list-reorder pattern) goes here, with the reason it may run on a revalidation.
export const BOUNDARY_EXEMPTIONS: readonly BoundaryExemption[] = [];

export interface TransitionClass {
  readonly file: string;
  readonly line: number;
  readonly className: string;
}

const TRIGGER_PROPS: ReadonlySet<string> = new Set(["default", "enter", "exit", "update", "share"]);
const REACT_KEYWORDS: ReadonlySet<string> = new Set(["auto", "none"]);

function isViewTransitionTag(tagName: ts.JsxTagNameExpression): boolean {
  if (ts.isIdentifier(tagName)) return tagName.text === "ViewTransition";
  return ts.isPropertyAccessExpression(tagName) && tagName.name.text === "ViewTransition";
}

type BoundaryElement = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function boundaries(tree: ts.SourceFile): readonly BoundaryElement[] {
  const found: BoundaryElement[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && isViewTransitionTag(node.tagName)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

function attributes(element: BoundaryElement): ReadonlyMap<string, ts.JsxAttribute> {
  const named = new Map<string, ts.JsxAttribute>();
  for (const attribute of element.attributes.properties) {
    if (ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name)) named.set(attribute.name.text, attribute);
  }
  return named;
}

// The string a prop is set to when it is a literal, either `prop="x"` or `prop={"x"}`.
function literalValue(attribute: ts.JsxAttribute | undefined): string | null {
  const initializer = attribute?.initializer;
  if (initializer === undefined) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)) {
    return initializer.expression.text;
  }
  return null;
}

function lineOf(tree: ts.SourceFile, node: ts.Node): number {
  return tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
}

function parse(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function findBoundaryViolations(source: string, file: string): readonly BoundaryViolation[] {
  if (BOUNDARY_EXEMPTIONS.some((exemption) => exemption.file === file)) return [];
  const tree = parse(source, file);
  return boundaries(tree).flatMap((element) => {
    const props = attributes(element);
    const line = lineOf(tree, element);
    const violations: BoundaryViolation[] = [];
    if (literalValue(props.get("default")) !== "none") violations.push({ file, line, rule: "default-none" });
    if (props.has("name") && !props.has("share")) violations.push({ file, line, rule: "named-without-share" });
    return violations;
  });
}

// The class strings inside a trigger prop: the literal itself, or each value of a
// type-keyed map (`{ "nav-forward": "slide-in", default: "none" }`).
function classStrings(attribute: ts.JsxAttribute): readonly ts.StringLiteralLike[] {
  const initializer = attribute.initializer;
  if (initializer === undefined) return [];
  if (ts.isStringLiteral(initializer)) return [initializer];
  const expression = ts.isJsxExpression(initializer) ? initializer.expression : undefined;
  if (expression === undefined) return [];
  if (ts.isStringLiteralLike(expression)) return [expression];
  if (!ts.isObjectLiteralExpression(expression)) return [];
  return expression.properties
    .filter(ts.isPropertyAssignment)
    .map((property) => property.initializer)
    .filter(ts.isStringLiteralLike);
}

export function findTransitionClasses(source: string, file: string): readonly TransitionClass[] {
  const tree = parse(source, file);
  return boundaries(tree).flatMap((element) =>
    [...attributes(element)]
      .filter(([name]) => TRIGGER_PROPS.has(name))
      .flatMap(([, attribute]) => classStrings(attribute))
      .flatMap((literal) => literal.text.split(/\s+/).filter(Boolean)
        .filter((className) => !REACT_KEYWORDS.has(className))
        .map((className) => ({ file, line: lineOf(tree, literal), className }))));
}

function styledClasses(css: string): ReadonlySet<string> {
  const styled = new Set<string>();
  postcss.parse(css).walkRules((rule) => {
    for (const match of rule.selector.matchAll(/::view-transition-(?:group|image-pair|old|new)\(\s*\.([\w-]+)\s*\)/g)) {
      styled.add(match[1]);
    }
  });
  return styled;
}

export function undeclaredTransitionClasses(classes: readonly TransitionClass[], css: string): readonly TransitionClass[] {
  const styled = styledClasses(css);
  return classes.filter(({ className }) => !styled.has(className));
}

export function liveRootGaps(css: string): readonly string[] {
  return missingDeclarations(css, {
    "::view-transition-old(root)": { display: "none" },
    "::view-transition-new(root)": { animation: "none" },
  });
}
