import postcss, { type Declaration } from "postcss";
import ts from "@typescript/typescript6";
import { PERSISTENT_ELEMENTS, TIER_Z_INDEX, type PersistentElement, type PersistentElementKey } from "./persistent-transition.ts";

// ADR-0119: a persistent element is pinned through the registry and frozen in the
// stylesheet. Two halves have to agree, and nothing renders a transition in CI to notice
// when they don't (view-transitions audit §11), so this module reads both:
//
//   - `isolationGaps` names each isolation declaration `app/globals.css` is missing for
//     the registry, so a renamed or newly pinned element cannot ship unfrozen.
//   - `findPersistentTransitionUses` finds every place a component sets a
//     view-transition name. A name passed through `persistentTransitionStyle` reports its
//     key; anything written by hand reports `null`, which the sweep rejects — a name
//     outside the registry has no isolation rule, and a name rendered twice makes the
//     browser abort the whole transition.

export interface PersistentTransitionUse {
  readonly file: string;
  readonly line: number;
  // Null when the name bypasses the registry.
  readonly key: PersistentElementKey | null;
}

export type Requirements = Readonly<Record<string, Readonly<Record<string, string>>>>;

function requirementsFor(element: PersistentElement): Requirements {
  const group = { animation: "none", "z-index": String(TIER_Z_INDEX[element.tier]) };
  if (!element.hasBackdrop) return { [`::view-transition-group(${element.name})`]: group };
  return {
    [`::view-transition-group(${element.name})`]: group,
    [`::view-transition-old(${element.name})`]: { display: "none" },
    [`::view-transition-new(${element.name})`]: { animation: "none" },
  };
}

function isTopLevel(declaration: Declaration): boolean {
  for (let parent = declaration.parent?.parent; parent; parent = parent.parent) {
    // A cascade layer changes precedence, not applicability; any other at-rule (a media
    // or supports query) means the element is pinned only some of the time.
    if (parent.type === "atrule" && (parent as postcss.AtRule).name !== "layer") return false;
  }
  return true;
}

// Every declaration a selector receives unconditionally, last one winning.
function declaredBySelector(css: string): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const declared = new Map<string, Map<string, string>>();
  postcss.parse(css).walkDecls((declaration) => {
    if (declaration.parent?.type !== "rule" || !isTopLevel(declaration)) return;
    for (const raw of (declaration.parent as postcss.Rule).selectors) {
      const selector = raw.replace(/\s+/g, "");
      const properties = declared.get(selector) ?? new Map<string, string>();
      properties.set(declaration.prop.toLowerCase(), declaration.value.trim().toLowerCase());
      declared.set(selector, properties);
    }
  });
  return declared;
}

// Each `selector needs property: value` the stylesheet does not declare unconditionally.
// Shared with `view-transition-boundary-policy.ts`, which holds the live root to the same test.
export function missingDeclarations(css: string, requirements: Requirements): readonly string[] {
  const declared = declaredBySelector(css);
  return Object.entries(requirements).flatMap(([selector, properties]) =>
    Object.entries(properties)
      .filter(([property, value]) => declared.get(selector)?.get(property) !== value)
      .map(([property, value]) => `${selector} needs ${property}: ${value}`));
}

export function isolationGaps(css: string, elements: readonly PersistentElement[]): readonly string[] {
  return elements.flatMap((element) => missingDeclarations(css, requirementsFor(element)));
}

function isRegistryKey(value: string): value is PersistentElementKey {
  return Object.hasOwn(PERSISTENT_ELEMENTS, value);
}

function persistentStyleKey(node: ts.CallExpression): PersistentElementKey | null {
  const [argument] = node.arguments;
  return argument !== undefined && ts.isStringLiteralLike(argument) && isRegistryKey(argument.text) ? argument.text : null;
}

function isNamedProperty(node: ts.Node): boolean {
  if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) return false;
  const name = node.name;
  return (ts.isIdentifier(name) || ts.isStringLiteral(name))
    && (name.text === "viewTransitionName" || name.text === "view-transition-name");
}

export function findPersistentTransitionUses(source: string, file: string): readonly PersistentTransitionUse[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uses: PersistentTransitionUse[] = [];
  const lineOf = (node: ts.Node): number => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "persistentTransitionStyle") {
      uses.push({ file, line: lineOf(node), key: persistentStyleKey(node) });
    } else if (isNamedProperty(node)) {
      uses.push({ file, line: lineOf(node), key: null });
    } else if (ts.isStringLiteralLike(node) && /\[view-transition-name:/.test(node.text)) {
      uses.push({ file, line: lineOf(node), key: null });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return uses;
}

// A pinned element must not be a `<ViewTransition>`'s own top DOM node (ADR-0124). React names
// that node itself whenever the boundary animates, overriding the registry's name, so the
// element would lose its isolation exactly while it moves. Pin an always-mounted wrapper
// instead and animate what is inside it, as the sync toast does.
export function findPinnedUnderBoundary(source: string, file: string): readonly PersistentTransitionUse[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: PersistentTransitionUse[] = [];
  const isBoundary = (node: ts.Node): boolean =>
    ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "ViewTransition";
  const pinnedKey = (attributes: ts.JsxAttributes): PersistentElementKey | null | undefined => {
    for (const attribute of attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || attribute.name.getText(tree) !== "style") continue;
      const expression = attribute.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
      if (expression && ts.isCallExpression(expression) && expression.expression.getText(tree) === "persistentTransitionStyle") {
        return persistentStyleKey(expression);
      }
    }
    return undefined;
  };
  // `nearest` is the closest enclosing JSX element; a host element whose nearest JSX ancestor
  // is a boundary is that boundary's top DOM node.
  const visit = (node: ts.Node, nearest: ts.Node | null): void => {
    const element = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (element !== null && nearest !== null && isBoundary(nearest)) {
      const key = pinnedKey(element.attributes);
      if (key !== undefined) {
        found.push({ file, line: tree.getLineAndCharacterOfPosition(element.getStart(tree)).line + 1, key });
      }
    }
    const next = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) ? node : nearest;
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(tree, null);
  return found;
}
