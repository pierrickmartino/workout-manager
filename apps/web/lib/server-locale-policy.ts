import ts from "typescript";

// ADR-0096: an instant is written out in the *reader's* clock, which is only knowable in the
// reader's browser. A Server Component that calls `toLocaleString()` resolves against the
// container's `Intl` defaults — `en-US`, UTC, a machine in a datacentre — so the admin audit
// trail stamped every entry in somebody else's time.
//
// This guard sweeps every component and page and fails a module that is not a Client Component
// and formats a *moment* against the ambient locale. The remedy is
// `components/pulse/local-instant.tsx`, which renders a zone-explicit text on the server and
// swaps to the reader's after mount.
//
// It is about the clock, not about locale in general. A number's grouping separator resolved
// on the server is a cosmetic mismatch (`level-badge.tsx` renders XP that way); a timestamp
// resolved on the server is a wrong moment. Only the second is a bug worth a guard.

export type ServerClockMethod =
  | "toLocaleString"
  | "toLocaleDateString"
  | "toLocaleTimeString"
  | "Intl.DateTimeFormat";

export interface ServerClockViolation {
  readonly file: string;
  readonly line: number;
  readonly method: ServerClockMethod;
}

export interface ServerLocaleExemption {
  readonly file: string;
  readonly method: ServerClockMethod;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one timestamp is better read in the
// container's clock than in the reader's, which needs a reason a reviewer can weigh.
export const SERVER_LOCALE_EXEMPTIONS: readonly ServerLocaleExemption[] = [];

// These two exist only on a Date, so no receiver analysis is needed: seeing the name is enough.
const DATE_ONLY_METHODS = new Set<string>(["toLocaleDateString", "toLocaleTimeString"]);

// A directive prologue is a run of bare string literals at the very top of the module — before
// the imports, not after them. Next.js ignores a `"use client"` written anywhere else, so a
// module with a misplaced one is still a Server Component and this must keep watching it: the
// scan stops at the first statement that is not a directive, imports included.
function isClientComponent(tree: ts.SourceFile): boolean {
  for (const statement of tree.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

// Identifiers the file binds to a `new Date(...)`. Naming the Date first does not move the
// formatting to the reader's machine, so `const at = new Date(x); at.toLocaleString()` is the
// same violation written over two lines.
function dateBindings(tree: ts.SourceFile): ReadonlySet<string> {
  const bound = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer !== undefined
      && ts.isNewExpression(node.initializer)
      && node.initializer.expression.getText(tree) === "Date"
    ) {
      bound.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return bound;
}

// Whether `receiver.toLocaleString()` is formatting a moment. `Number.prototype` has the same
// method name, so the answer is read off the receiver: a `new Date(...)` written in place, or
// an identifier the file bound to one.
function isDateReceiver(
  receiver: ts.Expression,
  tree: ts.SourceFile,
  bound: ReadonlySet<string>,
): boolean {
  if (ts.isNewExpression(receiver) || ts.isCallExpression(receiver)) {
    return receiver.expression.getText(tree) === "Date";
  }
  return ts.isIdentifier(receiver) && bound.has(receiver.text);
}

export function findServerClockFormatting(
  source: string,
  file: string,
): readonly ServerClockViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (isClientComponent(tree)) return [];

  const bound = dateBindings(tree);
  const violations: ServerClockViolation[] = [];
  const at = (node: ts.Node): number =>
    tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (DATE_ONLY_METHODS.has(name)) {
        violations.push({ file, line: at(node), method: name as ServerClockMethod });
      } else if (name === "toLocaleString" && isDateReceiver(node.expression, tree, bound)) {
        violations.push({ file, line: at(node), method: "toLocaleString" });
      } else if (name === "DateTimeFormat" && node.expression.getText(tree) === "Intl") {
        violations.push({ file, line: at(node), method: "Intl.DateTimeFormat" });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);

  return violations.filter((violation) => !SERVER_LOCALE_EXEMPTIONS.some((exemption) =>
    exemption.file === violation.file && exemption.method === violation.method));
}

export function formatServerClockViolations(
  violations: readonly ServerClockViolation[],
): string {
  return violations.map(({ file, line, method }) =>
    `${file}:${line} — ${method} in a Server Component resolves against the container's clock,`
    + " not the reader's; render the instant with components/pulse/local-instant.tsx").join("\n");
}
