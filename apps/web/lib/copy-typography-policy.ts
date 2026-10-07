import ts from "typescript";

// ADR-0101: an apostrophe in an authored string is the typographic one (’), not the
// typewriter quote (') that doubles as a string delimiter. The app already writes
// curly quotes nearly everywhere — the audit's *Verified clean* says so — which is
// exactly why the stragglers read as a defect: one `can't` beside twenty `can’t`s.
//
// So this guard sweeps every authored string for a straight apostrophe between two
// letters, read from the AST: a JSX text node, a template span, or a string literal.
// Comments are not string literals, so a note *about* the rule — including this one —
// is not a breach of it.
//
// **Every** authored string, not only the rendered ones, because nothing in a string's
// syntax says who reads it: a guard's own failure message, a registry's `reason:` and a
// placeholder are the same node kind, and a sweep that tried to tell them apart would be
// guessing. A diagnostic is read by a person too, so the uniform rule costs nothing but
// claims nothing extra either — the rule is about the character, not about the audience.
//
// What it does not do is judge the sentence. Whether a placeholder should end in an
// ellipsis is a per-field judgement (an example pattern like `mm:ss` should not), and
// a guard that guessed would be wrong on half the fields.

export interface StraightApostrophe {
  readonly file: string;
  readonly line: number;
  // The offending word, for a message that points at the fix rather than the file.
  readonly excerpt: string;
}

export interface CopyExemption {
  readonly file: string;
  // The exact word to let through, so an exemption covers one string and not a file.
  readonly excerpt: string;
  readonly reason: string;
}

// An entry asserts that one string is matched against the outside world rather than
// read by a reader, which needs a reason a reviewer can weigh — so the reason is a
// required field, not a comment.
export const COPY_EXEMPTIONS: readonly CopyExemption[] = [
  {
    file: "lib/session-section.ts",
    excerpt: "world's",
    reason: "A keyword matched against an authored Exercise name (World's Greatest Stretch), "
      + "which a curator types with the typewriter apostrophe. The list already carries the "
      + "apostrophe-free spelling beside it; a curly one would match neither.",
  },
  {
    file: "lib/session-section.ts",
    excerpt: "child's",
    reason: "A keyword matched against an authored Exercise name (Child's Pose), as above.",
  },
];

// A straight apostrophe doing the job of ’ — a contraction or a possessive. Bounded by
// letters on both sides, which is what keeps a module specifier or a CSS selector out of
// it; a possessive plural (`the Sets' order`) is not matched and has never occurred.
const STRAIGHT_APOSTROPHE = /[A-Za-z]+'[A-Za-z]+/g;

// A string literal that is not copy by construction: the module specifier of an import
// or export, which the parser hands over as the same node kind.
function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;
  return parent !== undefined
    && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)
      || ts.isImportTypeNode(parent) || ts.isExternalModuleReference(parent));
}

export function findStraightApostrophes(
  source: string,
  file: string,
): readonly StraightApostrophe[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: StraightApostrophe[] = [];
  const report = (node: ts.Node, text: string): void => {
    for (const match of text.matchAll(STRAIGHT_APOSTROPHE)) {
      findings.push({
        file,
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        excerpt: match[0],
      });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) report(node, node.text);
    else if (ts.isStringLiteralLike(node) && !isModuleSpecifier(node)) report(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      report(node, node.head.text);
      for (const span of node.templateSpans) report(node, span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return findings.filter((finding) => !COPY_EXEMPTIONS.some((exemption) =>
    exemption.file === finding.file && exemption.excerpt === finding.excerpt));
}

export function formatStraightApostrophes(findings: readonly StraightApostrophe[]): string {
  return findings.map(({ file, line, excerpt }) =>
    `${file}:${line} — "${excerpt}" uses a straight apostrophe; write ’ (ADR-0101)`).join("\n");
}
