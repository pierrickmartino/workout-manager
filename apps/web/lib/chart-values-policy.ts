import ts from "@typescript/typescript6";

// ADR-0084: a plotted datum is not available until it is available as text. A Recharts plot
// hands its values to the eye and the pointer only — the SVG carries no per-point text and a
// hover tooltip has no keyboard equivalent — so a component that draws one owes its reader
// the same series through `ChartValues`. The rule is a source property (which component
// renders which element), so this module reads source, like `motion-policy` before it.
//
// Given one file's text it returns the violations that file declares; walking the tree is
// the caller's job (see chart-values-policy.test.ts), which keeps this module pure.
//
// **What this guard proves, and what it does not.** It proves a values table is *rendered*
// beside every plot. It cannot prove the table's rows match the plotted array — that is a
// runtime property, and it is the `audit/charts.mjs` per-point parity assertion's job plus
// the view-model unit tests'. A green run here is not evidence of equivalence, and ADR-0084
// says so rather than letting the guard imply more than it checks.
//
// It fails closed on an unrecognised `recharts` import: the next chart type someone reaches
// for is exactly the case a fixed list of known plots would wave through.
//
// It also holds every plot root to `accessibilityLayer={false}`. Recharts 3 turns the layer on
// by default, which makes the SVG an unnamed `role="application"` tab stop with arrow-key
// traversal — the focusable-SVG model ADR-0084 rejected in favour of the values table. Only
// the literal `false` discharges it; a missing, bare or `{true}` attribute leaves it on.

// Recharts' plot roots — importing one of these means this component draws a plot, and the
// rule applies. The list is the trigger, not the authority: an unknown import fails closed.
const PLOT_ROOTS: ReadonlySet<string> = new Set([
  "AreaChart", "BarChart", "ComposedChart", "FunnelChart", "LineChart", "PieChart",
  "RadarChart", "RadialBarChart", "SankeyChart", "ScatterChart", "SunburstChart", "Treemap",
]);

// Recharts' parts — axes, marks, decorations and containers. They never draw a plot on their
// own, so on their own they trigger nothing. Kept explicit so that anything Recharts exports
// which is neither a known plot nor a known part reaches the fail-closed branch.
const PLOT_PARTS: ReadonlySet<string> = new Set([
  "Area", "Bar", "Brush", "Cell", "CartesianGrid", "Curve", "Cross", "Customized", "Dot",
  "ErrorBar", "Funnel", "Label", "LabelList", "Legend", "Line", "Pie", "PolarAngleAxis",
  "PolarGrid", "PolarRadiusAxis", "Polygon", "Radar", "RadialBar", "Rectangle",
  "ReferenceArea", "ReferenceDot", "ReferenceLine", "ResponsiveContainer", "Scatter",
  "Sector", "Text", "Tooltip", "XAxis", "YAxis", "ZAxis",
  // Type-only exports carry no runtime behaviour.
  "TooltipProps", "TooltipContentProps", "LegendProps", "DotProps",
]);

// The component that discharges the rule. A plot-bearing file must render it.
const VALUES_ELEMENT = "ChartValues";

// The primitive itself, which renders the table rather than a plot, and would otherwise be
// asked to render itself.
const POLICY_MODULE = "components/pulse/chart-values.tsx";

export interface ChartValuesExemption {
  readonly file: string;
  readonly reason: string;
}

// A plot may go without its values only where rendering them would itself be a defect. The
// reason is a required field, not a comment, because that is a claim a reviewer must weigh.
export const CHART_VALUES_EXEMPTIONS: readonly ChartValuesExemption[] = [
  {
    file: "components/analytics/strength-trajectories.tsx",
    reason:
      "The Strength Analytics miniature is a teaser, not a chart a reader retrieves values " +
      "from (ADR-0024): it is hidden from the accessibility tree and wrapped in a <Link> to " +
      "the canonical Exercise Detail chart, which carries the full series. A disclosure here " +
      "would be a focusable control inside aria-hidden, and a <details> nested in an <a> — " +
      "an accessibility defect and invalid markup. CH-F4 accepts the link precisely because " +
      "its destination now provides complete value access. The chart component keeps the " +
      "values on by default; this call site opts out with showValues={false}.",
  },
];

export type ChartValuesFailure =
  // The file draws a plot and renders no values table.
  | { readonly kind: "missing-values"; readonly plot: string }
  // The file imports something from recharts that this module cannot classify.
  | { readonly kind: "unknown-import"; readonly imported: string }
  // A plot root renders without `accessibilityLayer={false}`, so its SVG is a tab stop.
  | { readonly kind: "focusable-plot"; readonly plot: string };

export interface ChartValuesViolation {
  readonly file: string;
  readonly line: number;
  readonly failure: ChartValuesFailure;
}

interface RechartsImport {
  readonly name: string;
  // The name the file uses in JSX: the alias where `as` renamed it.
  readonly local: string;
  readonly line: number;
}

// Every named import from `recharts` in this file, with the line it sits on. Reads the AST
// rather than the bytes, so a mention of `BarChart` in a comment or a string never counts.
function rechartsImports(tree: ts.SourceFile): readonly RechartsImport[] {
  const found: RechartsImport[] = [];
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "recharts") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      found.push({
        // `import { LineChart as Plot }` — the rule is about the imported symbol, so read
        // `propertyName` where an alias renamed it.
        name: (element.propertyName ?? element.name).text,
        local: element.name.text,
        line: tree.getLineAndCharacterOfPosition(element.getStart(tree)).line + 1,
      });
    }
  }
  return found;
}

// Whether this file renders `<ChartValues …>` anywhere. A JSX element, not a string match:
// a comment promising a values table does not discharge the rule.
function rendersValues(tree: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    const tag = ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
      ? node.tagName
      : null;
    if (tag !== null && ts.isIdentifier(tag) && tag.text === VALUES_ELEMENT) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return found;
}

// Whether a JSX element spells `accessibilityLayer={false}`.
function turnsAccessibilityLayerOff(element: ts.JsxOpeningLikeElement): boolean {
  return element.attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute)
    && ts.isIdentifier(attribute.name)
    && attribute.name.text === "accessibilityLayer"
    && attribute.initializer !== undefined
    && ts.isJsxExpression(attribute.initializer)
    && attribute.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword);
}

// Every rendered plot root that leaves Recharts' accessibility layer on.
interface PlotElement {
  readonly plot: string;
  readonly line: number;
}

function focusablePlots(
  tree: ts.SourceFile,
  plots: readonly RechartsImport[],
): readonly PlotElement[] {
  const byLocal = new Map(plots.map((plot) => [plot.local, plot.name]));
  const found: PlotElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const plot = ts.isIdentifier(node.tagName) ? byLocal.get(node.tagName.text) : undefined;
      if (plot !== undefined && !turnsAccessibilityLayerOff(node)) {
        found.push({ plot, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return found;
}

export function findChartValuesViolations(
  source: string,
  file: string,
): readonly ChartValuesViolation[] {
  if (file === POLICY_MODULE) {
    return [];
  }
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = rechartsImports(tree);
  if (imports.length === 0) {
    return [];
  }

  const violations: ChartValuesViolation[] = [];
  const unknown = imports.filter(
    ({ name }) => !PLOT_ROOTS.has(name) && !PLOT_PARTS.has(name),
  );
  for (const { name, line } of unknown) {
    violations.push({ file, line, failure: { kind: "unknown-import", imported: name } });
  }

  const plots = imports.filter(({ name }) => PLOT_ROOTS.has(name));
  if (plots.length > 0 && !rendersValues(tree)) {
    for (const { name, line } of plots) {
      violations.push({ file, line, failure: { kind: "missing-values", plot: name } });
    }
  }
  for (const { plot, line } of focusablePlots(tree, plots)) {
    violations.push({ file, line, failure: { kind: "focusable-plot", plot } });
  }

  // An exemption excuses a missing values table only: a focusable plot is a defect anywhere,
  // and worst in the exempt aria-hidden miniature.
  return violations.filter(
    (violation) => violation.failure.kind !== "missing-values"
      || !CHART_VALUES_EXEMPTIONS.some((exemption) => exemption.file === violation.file),
  );
}

export function formatChartValuesViolations(
  violations: readonly ChartValuesViolation[],
): string {
  return violations.map(({ file, line, failure }) => {
    if (failure.kind === "unknown-import") {
      return `${file}:${line} — recharts' ${failure.imported} is neither a known plot nor a ` +
        "known plot part; classify it in chart-values-policy.ts (PLOT_ROOTS or PLOT_PARTS)";
    }
    if (failure.kind === "focusable-plot") {
      return `${file}:${line} — <${failure.plot}> leaves Recharts' accessibility layer on, so its ` +
        "SVG is an unnamed tab stop; set accessibilityLayer={false} and let the values table " +
        "carry the data (ADR-0084)";
    }
    return `${file}:${line} — ${failure.plot} plots values this component never renders as ` +
      `text; pair it with <${VALUES_ELEMENT}> over the same rows (ADR-0084)`;
  }).join("\n");
}
