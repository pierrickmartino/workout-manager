import ts from "@typescript/typescript6";

// ADR-0107: a `Field` publishes its id, its descriptions and its invalid state on a context,
// and the control inside **claims** them — by being one of the design-system primitives, or
// by spreading `useFieldControl()` where it is not one. Position stopped mattering, which is
// what the old contract got wrong: `Children.toArray(children)[0]` was "the control", so
// wrapping it in a layout div, rendering something before it, or reordering silently moved
// the `id`/`aria-describedby`/`aria-invalid` wiring onto the wrong element — and what broke
// was accessibility, which no render-time error reports.
//
// Removing that contract moves the silent failure rather than deleting it: a field whose
// subtree holds *no* claimant has a `<label for>` pointing at nothing and an unassociated
// hint, and a field holding *two* has both of them claiming one id. Neither throws, both
// read as working, so both are mechanized here.
//
// It proves a claimant is *present*, not that the wiring is right — the attributes a
// primitive actually emits inside a field are asserted by rendering one, in
// `form-accessibility.test.ts`.
//
// `FieldGroup` is deliberately **not** a field element here (ADR-0108): it is a `<fieldset>` and
// `<legend>` publishing no wiring, so there is no id for a control inside it to claim and two
// controls under one caption is the normal case (ADR-0032's distance-and-time pair). Nor does
// the descent stop at one — a `FieldGroup` nested inside a `Field` provides no context of its
// own, so the controls in it really do claim that field's id, and stopping would hide it. This
// replaced reading a `group` flag off `FieldLabel`, which the guard also had to fail closed on
// when the flag was an expression it could not evaluate.

// Declared once and the type derived from it, so renaming one cannot leave the other behind
// (ADR-0105's `as const satisfies` reasoning: a second, untyped declaration of a union drops
// silently out of agreement with the first).
const FIELD_ELEMENTS = ["Field", "FieldLabel"] as const;

export type FieldElement = (typeof FIELD_ELEMENTS)[number];
export type FieldControlProblem =
  | "unclaimed"
  | "ambiguous"
  | "competing-id";

export interface FieldControlViolation {
  readonly file: string;
  // The field's own line, except for `competing-id`, which points at the control that has to
  // change — the field above it is fine.
  readonly line: number;
  readonly element: FieldElement;
  readonly problem: FieldControlProblem;
  // Claimants found in the field's subtree, which is what `ambiguous` counts.
  readonly controls: number;
}

export interface FieldControlExemption {
  readonly file: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one field is better off with its label
// association unverifiable, which needs a reason a reviewer can weigh — so the reason is a
// required field, not a comment.
export const FIELD_CONTROL_EXEMPTIONS: readonly FieldControlExemption[] = [];

function isFieldTag(tag: string): tag is FieldElement {
  return (FIELD_ELEMENTS as readonly string[]).includes(tag);
}

// The three primitives read the context themselves (ADR-0093 already routes every control
// through them), so using one *is* the claim. Anything else says so out loud.
const PRIMITIVE_CONTROLS = new Set<string>(["Input", "Select", "Textarea"]);

// Design-system controls that live in a module of their own and render exactly one primitive, so
// rendering one is the claim too. The guard reads one file and cannot see inside them, so each is
// named here with its module, and `field-control-policy.test.ts` holds that the module renders
// exactly one primitive — an entry is a checked claim, not a pass.
export const SHARED_CONTROLS: Readonly<Record<string, string>> = {
  LoadValueInput: "components/pulse/load-value-input.tsx",
};

// The two shapes the claim is published in: the wiring itself, and the props-splitting pair the
// primitives use. A control that is not a primitive could reasonably reach for either, so both
// are traced — otherwise the second would read as no claim at all and flag working code.
const CLAIM_HOOKS = new Set<string>(["useFieldControl", "useFieldControlProps"]);

// The module that defines `Field` renders one around `{children}` it was handed, so its own
// call site has no control to find and never will. A guard has to be able to spell its own
// subject.
const DEFINING_MODULE = "components/pulse/field.tsx";

function elementTag(node: ts.Node, tree: ts.SourceFile): string | null {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(tree);
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(tree);
  return null;
}

function attributesOf(node: ts.Node): ts.JsxAttributes | null {
  if (ts.isJsxElement(node)) return node.openingElement.attributes;
  if (ts.isJsxSelfClosingElement(node)) return node.attributes;
  return null;
}

// What the hook's result can be reached through: the identifier it was assigned to, so
// `<input {...control} />` reads as the explicit claim it is, or the call itself. A spread of
// anything else declares nothing — the same reason `form-input-policy` refuses to read
// `{...props}` as a declaration.
interface Claimers {
  // `const control = useFieldControl()`.
  readonly identifiers: ReadonlySet<string>;
  // Components declared in this file that spread one. A hook can only be called *below* the
  // provider, so a control that is not a primitive has to be its own component — which is why
  // the claim is traced through the local declaration rather than looked for inline.
  readonly components: ReadonlySet<string>;
}

function isClaimerExpression(
  expression: ts.Expression,
  identifiers: ReadonlySet<string>,
  tree: ts.SourceFile,
): boolean {
  if (ts.isIdentifier(expression)) return identifiers.has(expression.text);
  return isClaimCall(expression, tree);
}

function isClaimCall(expression: ts.Expression, tree: ts.SourceFile): boolean {
  return ts.isCallExpression(expression) && CLAIM_HOOKS.has(expression.expression.getText(tree));
}

// The name a claim was bound to: `const control = useFieldControl()`, or the first element of
// `const [field, rest] = useFieldControlProps(props)` — the wiring is that element, and `rest` is
// explicitly everything the field does not supply.
function boundClaimName(node: ts.VariableDeclaration): string | null {
  if (ts.isIdentifier(node.name)) return node.name.text;
  if (!ts.isArrayBindingPattern(node.name)) return null;
  const [first] = node.name.elements;
  if (first === undefined || !ts.isBindingElement(first) || !ts.isIdentifier(first.name)) {
    return null;
  }
  return first.name.text;
}

function readClaimers(tree: ts.SourceFile): Claimers {
  const identifiers = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && node.initializer !== undefined
      && isClaimCall(node.initializer, tree)
    ) {
      const bound = boundClaimName(node);
      if (bound !== null) identifiers.add(bound);
    }
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(tree, collect);

  const spreadsClaim = (node: ts.Node): boolean => {
    if (ts.isJsxSpreadAttribute(node) && isClaimerExpression(node.expression, identifiers, tree)) {
      return true;
    }
    let found = false;
    ts.forEachChild(node, (child) => {
      found = found || spreadsClaim(child);
    });
    return found;
  };
  const components = new Set<string>();
  const visit = (node: ts.Node): void => {
    const name = componentName(node);
    if (name !== null && spreadsClaim(node)) components.add(name);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return { identifiers, components };
}

// A capitalized local declaration that could be rendered as JSX. Lowercase names are DOM
// elements and could never be one.
function componentName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    return /^[A-Z]/.test(node.name.text) ? node.name.text : null;
  }
  if (
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && /^[A-Z]/.test(node.name.text)
    && node.initializer !== undefined
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text;
  }
  return null;
}

function isClaimingControl(
  node: ts.Node,
  tag: string,
  claimers: Claimers,
  tree: ts.SourceFile,
): boolean {
  if (PRIMITIVE_CONTROLS.has(tag) || Object.hasOwn(SHARED_CONTROLS, tag)) return true;
  if (claimers.components.has(tag)) return true;
  const attributes = attributesOf(node);
  if (attributes === null) return false;
  return attributes.properties.some((attribute) =>
    ts.isJsxSpreadAttribute(attribute)
    && isClaimerExpression(attribute.expression, claimers.identifiers, tree));
}

function declaresId(node: ts.Node): boolean {
  const attributes = attributesOf(node);
  if (attributes === null) return false;
  return attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute)
    && ts.isIdentifier(attribute.name)
    && attribute.name.text === "id");
}

interface Subtree {
  readonly claims: number;
  // Lines of claiming controls that name their own id. The field owns the id — that is what
  // its `<label for>` points at — so a control naming a second one puts the label on nothing,
  // which is the very failure the context contract removes.
  readonly competingIds: readonly number[];
}

const EMPTY: Subtree = { claims: 0, competingIds: [] };

function merge(left: Subtree, right: Subtree): Subtree {
  return {
    claims: left.claims + right.claims,
    competingIds: [...left.competingIds, ...right.competingIds],
  };
}

function childrenOf(node: ts.Node): readonly ts.Node[] {
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

// Claimants across a list of sibling nodes. The one accumulation, used both for a field's own
// children and for every level below them.
function inspectAll(
  nodes: readonly ts.Node[],
  claimers: Claimers,
  tree: ts.SourceFile,
): Subtree {
  return nodes.reduce<Subtree>(
    (total, node) => merge(total, inspect(node, claimers, tree)), EMPTY);
}

// Claimants in one field's subtree. Descent stops at a nested field, which owns its own
// control: counting the inner one twice would hide an outer field that has none.
function inspect(node: ts.Node, claimers: Claimers, tree: ts.SourceFile): Subtree {
  const tag = elementTag(node, tree);
  if (tag !== null && isFieldTag(tag)) return EMPTY;
  const claiming = tag !== null && isClaimingControl(node, tag, claimers, tree);
  const own: Subtree = {
    claims: claiming ? 1 : 0,
    competingIds: claiming && declaresId(node) ? [lineOf(node, tree)] : [],
  };
  return merge(own, inspectAll(childrenOf(node), claimers, tree));
}

function lineOf(node: ts.Node, tree: ts.SourceFile): number {
  return tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
}

function problemFor({ claims }: Subtree): FieldControlProblem | null {
  if (claims === 0) return "unclaimed";
  return claims > 1 ? "ambiguous" : null;
}

export function findFieldControlViolations(
  source: string,
  file: string,
): readonly FieldControlViolation[] {
  if (file === DEFINING_MODULE) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const claimers = readClaimers(tree);
  const violations: FieldControlViolation[] = [];
  const visit = (node: ts.Node): void => {
    const tag = elementTag(node, tree);
    if (tag !== null && isFieldTag(tag)) {
      const subtree = inspectAll(
        ts.isJsxElement(node) ? node.children : [], claimers, tree);
      const problem = problemFor(subtree);
      const field = { file, element: tag, controls: subtree.claims };
      if (problem !== null) violations.push({ ...field, line: lineOf(node, tree), problem });
      // Reported at the control's own line rather than the field's, because the control is
      // what has to change.
      for (const line of subtree.competingIds) {
        violations.push({ ...field, line, problem: "competing-id" });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return violations.filter((violation) =>
    !FIELD_CONTROL_EXEMPTIONS.some((exemption) => exemption.file === violation.file));
}

const REMEDIES: Record<FieldControlProblem, (controls: number) => string> = {
  unclaimed: () =>
    "wires an id and its descriptions that no control claims, so its label points at nothing;"
    + " render the control through components/ui/input.tsx, select.tsx or textarea.tsx, or"
    + " spread useFieldControl() onto it",
  ambiguous: (controls) =>
    `holds ${controls} controls, which would claim the same id; give each its own field, or`
    + " use FieldGroup, whose fieldset names every control inside it",
  "competing-id": () =>
    "holds a control naming its own id, which the field’s label does not point at; name the"
    + " id once, as htmlFor on the field, and let the control claim it",
};

export function formatFieldControlViolations(
  violations: readonly FieldControlViolation[],
): string {
  return violations.map(({ file, line, element, problem, controls }) =>
    `${file}:${line} — <${element}> ${REMEDIES[problem](controls)}`).join("\n");
}
