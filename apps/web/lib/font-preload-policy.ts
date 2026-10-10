import ts from "@typescript/typescript6";

// ADR-0050's amendment made executable. Every catalog Skin's typefaces are self-hosted by
// next/font in `app/layout.tsx`, and next/font preloads each family unless told not to. A
// preload is an unconditional high-priority download — `unicode-range` cannot veto it — so
// the default left every visitor downloading all nine files (235 KB) for the one Skin that
// renders (audit V-2, measured). The rule: a family keeps the default `preload: true` only
// if the default Skin's `--font-*` tokens name its handle, and every other family says
// `preload: false` literally.
//
// The preload set cannot be computed in the layout itself — next/font compiles its options
// at build time and accepts only literals — so this guard ties the literals to the two
// sources of truth instead: `DEFAULT_SKIN` and the Skin's typography tokens in
// `globals.css`. Change the default Skin and this fails until the preload set follows it.
//
// It fails closed: a next/font call whose `variable` or `preload` is not a literal, or a
// default-Skin handle no next/font call declares, is a violation rather than a pass.
//
// **What this guard proves, and what it does not.** It proves the layout *declares* the
// right preload set. Which files the server actually emits as preload hints is a build and
// render property; `audit/font-preload.mjs` counts them in a running app.

export interface NextFontCall {
  // The next/font loader called, e.g. `Space_Grotesk`.
  readonly loader: string;
  // The CSS variable handle it exposes, e.g. `--font-space-grotesk`; null when not a literal.
  readonly variable: string | null;
  // next/font's default is `true`; "unknown" when the option is present but not a literal.
  readonly preload: boolean | "unknown";
  readonly line: number;
}

export interface FontPreloadExemption {
  readonly variable: string;
  readonly reason: string;
}

// Deliberately empty. An entry asserts that every visitor should download a family the
// default Skin never renders (or skip one it does), which needs a reason a reviewer can weigh.
export const FONT_PRELOAD_EXEMPTIONS: readonly FontPreloadExemption[] = [];

export interface FontPreloadViolation {
  readonly line: number;
  readonly message: string;
}

const NEXT_FONT_MODULES = new Set(["next/font/google", "next/font/local"]);
const FONT_TOKENS = ["--font-display", "--font-sans", "--font-mono"];

// Every top-level call to a loader imported from next/font, with its literal options.
export function nextFontCalls(source: string, file: string): readonly NextFontCall[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const loaders = new Set<string>();
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || !NEXT_FONT_MODULES.has(specifier.text)) continue;
    const clause = statement.importClause;
    if (clause?.name) loaders.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) loaders.add(element.name.text);
    }
  }

  const calls: NextFontCall[] = [];
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) continue;
      if (!loaders.has(call.expression.text)) continue;
      const options = call.arguments[0];
      const properties = options && ts.isObjectLiteralExpression(options) ? options.properties : [];
      calls.push({
        loader: call.expression.text,
        variable: literalString(property(properties, "variable")),
        preload: preloadValue(property(properties, "preload")),
        line: tree.getLineAndCharacterOfPosition(call.getStart(tree)).line + 1,
      });
    }
  }
  return calls;
}

function property(
  properties: ts.NodeArray<ts.ObjectLiteralElementLike> | readonly never[],
  name: string,
): ts.Expression | undefined | null {
  const found = properties.find((element) =>
    element.name !== undefined && ts.isIdentifier(element.name) && element.name.text === name);
  if (found === undefined) return undefined;
  return ts.isPropertyAssignment(found) ? found.initializer : null;
}

function literalString(expression: ts.Expression | undefined | null): string | null {
  return expression && ts.isStringLiteral(expression) ? expression.text : null;
}

function preloadValue(expression: ts.Expression | undefined | null): boolean | "unknown" {
  if (expression === undefined) return true;
  if (expression === null) return "unknown";
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return "unknown";
}

// The next/font handles a Skin's typography tokens name. A Skin that restates its fonts
// does so under `html[data-skin="…"]`; one that doesn't (PULSE) inherits the `@theme`
// defaults, so those are its fonts.
export function skinFontHandles(css: string, skin: string): ReadonlySet<string> {
  const own = handlesIn(blockBody(css, `html[data-skin="${skin}"]`));
  if (own.size > 0) return own;
  return handlesIn(blockBody(css, "@theme"));
}

function handlesIn(body: string): ReadonlySet<string> {
  const handles = new Set<string>();
  for (const token of FONT_TOKENS) {
    const match = body.match(new RegExp(`${token}:\\s*var\\((--font-[\\w-]+)\\)`));
    if (match) handles.add(match[1]);
  }
  return handles;
}

// The text between the braces of the first block that opens with `selector {`.
function blockBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  return "";
}

export function findFontPreloadViolations(
  calls: readonly NextFontCall[],
  defaultHandles: ReadonlySet<string>,
): readonly FontPreloadViolation[] {
  const exempt = new Set(FONT_PRELOAD_EXEMPTIONS.map(({ variable }) => variable));
  const violations: FontPreloadViolation[] = [];
  for (const { loader, variable, preload, line } of calls) {
    if (variable === null || preload === "unknown") {
      violations.push({ line, message: `${loader}() — \`variable\` and \`preload\` must be ` +
        "literals so this guard can read which family is preloaded" });
      continue;
    }
    if (exempt.has(variable)) continue;
    const isDefault = defaultHandles.has(variable);
    if (isDefault && !preload) {
      violations.push({ line, message: `${loader}() — ${variable} is a default-Skin font, ` +
        "so it keeps next/font’s preload; drop `preload: false`" });
    }
    if (!isDefault && preload) {
      violations.push({ line, message: `${loader}() — ${variable} is not a default-Skin font, ` +
        "so preloading it makes every visitor download it at high priority; add `preload: false`" });
    }
  }
  const declared = new Set(calls.map(({ variable }) => variable));
  for (const handle of defaultHandles) {
    if (!declared.has(handle)) {
      violations.push({ line: 0, message: `${handle} — the default Skin’s tokens name it, ` +
        "but no next/font call declares it" });
    }
  }
  return violations;
}

export function formatFontPreloadViolations(
  violations: readonly FontPreloadViolation[],
  file: string,
): string {
  return violations.map(({ line, message }) => `${file}:${line} ${message} (ADR-0050)`).join("\n");
}
