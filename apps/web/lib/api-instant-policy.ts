import ts from "@typescript/typescript6";

// An API timestamp is read through `lib/instant.ts` (ADR-0096). The API emits instants with no
// offset, and ES parses an offsetless date-time as *local* time, so `Date.parse(row.made_current_at)`
// is off by the reader's own offset before anything is formatted. Review caught exactly that
// (#643); this guard turns it into a test failure.
//
// Two shapes are flagged, read off the AST so a comment never counts:
// - any `Date.parse(…)`: the parse belongs to `parseApiInstant`, or for a calendar date to
//   `date-format.ts`;
// - `new Date(x)` whose argument names an API instant field: the snake_case `…_at` the API
//   serialises (`created_at`, `made_current_at`). An epoch-ms number (`startedAt`) is not one.

// The module that owns the parse.
const INSTANT_MODULE = "lib/instant.ts";

// Files allowed a bare `Date.parse`, each with why its input is not an API instant.
export const EXEMPT_FILES: ReadonlyMap<string, string> = new Map([
  ["lib/exercise-usage-view.ts",
    "parses date-only YYYY-MM-DD strings, which ES reads as UTC: a calendar date, not an instant"],
]);

const API_INSTANT_FIELD = /_at$/;

export interface ApiInstantViolation {
  readonly file: string;
  readonly line: number;
  readonly shape: "Date.parse" | "new Date";
}

function isDateParse(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee)
    && ts.isIdentifier(callee.expression)
    && callee.expression.text === "Date"
    && callee.name.text === "parse";
}

// The last name an argument reads: `row.made_current_at` → `made_current_at`.
function terminalName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) {
    return terminalName(node.expression);
  }
  return null;
}

function isNewDateOfApiInstant(node: ts.NewExpression): boolean {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "Date") return false;
  if (node.arguments?.length !== 1) return false;
  const name = terminalName(node.arguments[0]);
  return name !== null && API_INSTANT_FIELD.test(name);
}

export function findApiInstantViolations(
  source: string,
  file: string,
): readonly ApiInstantViolation[] {
  if (file === INSTANT_MODULE) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const exempt = EXEMPT_FILES.has(file);
  const violations: ApiInstantViolation[] = [];
  const lineOf = (node: ts.Node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isDateParse(node) && !exempt) {
      violations.push({ file, line: lineOf(node), shape: "Date.parse" });
    } else if (ts.isNewExpression(node) && isNewDateOfApiInstant(node)) {
      violations.push({ file, line: lineOf(node), shape: "new Date" });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return violations;
}

export function formatApiInstantViolations(
  violations: readonly ApiInstantViolation[],
): string {
  return violations.map(({ file, line, shape }) =>
    `${file}:${line} — ${shape}(…) reads an offsetless API instant as local time; ` +
    `parse it with parseApiInstant from ${INSTANT_MODULE} (ADR-0096)`).join("\n");
}
