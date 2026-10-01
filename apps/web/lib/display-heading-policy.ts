import ts from "typescript";

// ADR-0101: a display title decides its own wrap. Left to the browser, a two-line
// heading breaks wherever the line box runs out — which on a 320px screen regularly
// leaves one word alone on the second line, and on the wide shell leaves a title
// hanging off a long first line. `text-wrap: balance` asks the browser to even the
// lines out instead; `pretty` is the same decision taken the other way.
//
// This guard sweeps every component and page for a heading set in the display face and
// no answer to that question. It is about the heading's *typesetting*, so it keys on
// `font-display` — the mono label and eyebrow forms are label-sized and have no
// display wrap to even out.
//
// What it proves is that the decision is declared. Whether a given title reads better
// balanced or pretty is a judgement, and both pass.

export type HeadingElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

// Why a heading is reported: it never says how to wrap, or its classes cannot be read
// from the source at all (in which case the display question cannot be answered).
export type UnbalancedReason = "no text-balance" | "classes unreadable";

export interface UnbalancedHeading {
  readonly file: string;
  readonly line: number;
  readonly element: HeadingElement;
  readonly reason: UnbalancedReason;
}

export interface DisplayHeadingExemption {
  readonly file: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one display title is better off
// breaking wherever it lands, which needs a reason a reviewer can weigh — so the
// reason is a required field, not a comment.
export const DISPLAY_HEADING_EXEMPTIONS: readonly DisplayHeadingExemption[] = [];

const HEADING_ELEMENTS = new Set<string>(["h1", "h2", "h3", "h4", "h5", "h6"]);

// The utilities that decide the wrap. Either is an answer.
const WRAP_UTILITIES = ["text-balance", "text-pretty"];

// A heading that cannot wrap has no wrap to even out: `truncate` and a one-line clamp
// are single-line by construction. A `line-clamp-2` still wraps, so it still balances.
const SINGLE_LINE_UTILITIES = ["truncate", "line-clamp-1"];

const DISPLAY_FACE = "font-display";

// Every class name the source states for this element, read through the shapes the app
// writes: a plain string, a `cn()` call, a conditional, a template literal. Returns
// `null` when the attribute is there but contributes no readable literal — the classes
// are then unknown, not absent.
//
// This does not reuse `motion-policy.ts`'s `collectClassStrings`, which the faded-text
// sweep shares with it, and the difference is the reason: that one collects every class
// literal in a *file* with a flag for whether it sits in a class context, which is all a
// per-token rule needs. This question is per *element* — which classes belong to this
// heading — so the walk has to start at the attribute rather than at the file. The two
// cannot disagree about what a class string is, because neither tokenizes: this one only
// asks whether a name is present.
function readClassNames(element: ts.JsxOpeningLikeElement): readonly string[] | null {
  const attribute = element.attributes.properties.find((property): property is ts.JsxAttribute =>
    ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === "className");
  if (attribute === undefined) return [];
  const literals: string[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) literals.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      literals.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
      for (const span of node.templateSpans) collect(span.expression);
      return;
    }
    ts.forEachChild(node, collect);
  };
  if (attribute.initializer !== undefined) collect(attribute.initializer);
  if (literals.length === 0) return null;
  return literals.flatMap((literal) => literal.split(/\s+/)).filter((token) => token.length > 0);
}

function reasonFor(classes: readonly string[] | null): UnbalancedReason | null {
  if (classes === null) return "classes unreadable";
  if (!classes.includes(DISPLAY_FACE)) return null;
  if (classes.some((token) => SINGLE_LINE_UTILITIES.includes(token))) return null;
  if (classes.some((token) => WRAP_UTILITIES.includes(token))) return null;
  return "no text-balance";
}

export function findUnbalancedDisplayHeadings(
  source: string,
  file: string,
): readonly UnbalancedHeading[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: UnbalancedHeading[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      // Only the literal heading element. A capitalized tag renders what its own
      // component decides, which is not readable from the call site — `SessionCard`'s
      // `<Title>` is one, and it truncates, so it has no wrap either way.
      if (HEADING_ELEMENTS.has(tag)) {
        const reason = reasonFor(readClassNames(node));
        if (reason !== null) {
          findings.push({
            file,
            line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
            element: tag as HeadingElement,
            reason,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return findings.filter((finding) =>
    !DISPLAY_HEADING_EXEMPTIONS.some((exemption) => exemption.file === finding.file));
}

export function formatUnbalancedHeadings(findings: readonly UnbalancedHeading[]): string {
  return findings.map(({ file, line, element, reason }) => {
    const remedy = reason === "classes unreadable"
      ? "its className cannot be read from the source; state the classes inline so the wrap is reviewable"
      : "add text-balance (or text-pretty) so the title decides its own wrap (ADR-0101)";
    return `${file}:${line} — <${element}> ${reason}; ${remedy}`;
  }).join("\n");
}
