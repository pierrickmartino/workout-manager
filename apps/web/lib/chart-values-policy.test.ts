import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findChartValuesViolations,
  formatChartValuesViolations,
  CHART_VALUES_EXEMPTIONS,
} from "./chart-values-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

// The same two roots `motion-policy` sweeps: every component, and every page, since nothing
// stops a route from rendering a plot inline. `audit/` is deliberately out — it is the
// browser harness, not a product surface, and it mounts these components rather than
// drawing its own plots.
function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("flags a plot that renders none of its values as text", () => {
  // Arrange — the shape all three charts had before ADR-0084
  const source = `
    import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
    export function Chart({ rows }: { rows: Row[] }) {
      return <ResponsiveContainer><LineChart data={rows} accessibilityLayer={false}><Line dataKey="v" /></LineChart></ResponsiveContainer>;
    }`;

  // Act
  const violations = findChartValuesViolations(source, "components/pulse/x-chart.tsx");

  // Assert
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].failure, { kind: "missing-values", plot: "LineChart" });
});

test("accepts a plot paired with its values table", () => {
  // Arrange
  const source = `
    import { Line, LineChart } from "recharts";
    import { ChartValues } from "@/components/pulse/chart-values";
    export function Chart({ rows }: { rows: Row[] }) {
      return <div><LineChart data={rows} accessibilityLayer={false}><Line dataKey="v" /></LineChart>
        <ChartValues caption="c" labelHeading="D" valueHeading="V" rows={rows} /></div>;
    }`;

  // Act / Assert
  assert.deepEqual(findChartValuesViolations(source, "components/pulse/x-chart.tsx"), []);
});

test("ignores a component that imports only plot parts", () => {
  // Arrange — a shared axis or tooltip helper draws no plot of its own
  const source = `
    import { Tooltip, XAxis, type TooltipProps } from "recharts";
    export function Axis() { return <XAxis />; }`;

  // Act / Assert
  assert.deepEqual(findChartValuesViolations(source, "components/pulse/axis.tsx"), []);
});

test("ignores a component that touches recharts not at all", () => {
  // Arrange
  const source = `export function Card() { return <div>plain</div>; }`;

  // Act / Assert
  assert.deepEqual(findChartValuesViolations(source, "components/ui/card.tsx"), []);
});

test("fails closed on a recharts import it cannot classify", () => {
  // Arrange — the next chart type someone reaches for. A fixed list of known plots would
  // wave this through; the rule exists for exactly the chart nobody has thought of yet.
  const source = `
    import { FutureChart } from "recharts";
    export function Chart() { return <FutureChart />; }`;

  // Act
  const violations = findChartValuesViolations(source, "components/pulse/future-chart.tsx");

  // Assert
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].failure, { kind: "unknown-import", imported: "FutureChart" });
});

test("reads the imported symbol through an alias", () => {
  // Arrange — renaming the import does not change what it draws
  const source = `
    import { BarChart as Plot } from "recharts";
    export function Chart({ rows }: { rows: Row[] }) { return <Plot data={rows} accessibilityLayer={false} />; }`;

  // Act
  const violations = findChartValuesViolations(source, "components/pulse/x-chart.tsx");

  // Assert
  assert.deepEqual(violations[0].failure, { kind: "missing-values", plot: "BarChart" });
});

test("is not satisfied by a comment or a string that merely names the values table", () => {
  // Arrange — the reason this reads TypeScript rather than bytes
  const source = `
    import { BarChart } from "recharts";
    // TODO: add ChartValues here
    const note = "<ChartValues />";
    export function Chart({ rows }: { rows: Row[] }) { return <BarChart data={rows} accessibilityLayer={false} />; }`;

  // Act
  const violations = findChartValuesViolations(source, "components/pulse/x-chart.tsx");

  // Assert
  assert.equal(violations.length, 1);
  assert.equal(violations[0].failure.kind, "missing-values");
});

test("flags a plot root that leaves Recharts' accessibility layer on", () => {
  // Arrange — Recharts 3 turns it on by default: the SVG becomes an unnamed
  // role="application" tab stop, the focusable-SVG model ADR-0084 rejected
  const source = `
    import { Line, LineChart } from "recharts";
    import { ChartValues } from "@/components/pulse/chart-values";
    export function Chart({ rows }: { rows: Row[] }) {
      return <div><LineChart data={rows}><Line dataKey="v" /></LineChart>
        <ChartValues caption="c" labelHeading="D" valueHeading="V" rows={rows} /></div>;
    }`;

  // Act
  const violations = findChartValuesViolations(source, "components/pulse/x-chart.tsx");

  // Assert
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].failure, { kind: "focusable-plot", plot: "LineChart" });
  assert.equal(violations[0].line, 5);
});

test("flags an accessibility layer switched on explicitly, through an alias", () => {
  // Arrange — only the literal `false` turns it off; a bare attribute or `true` is on
  const source = `
    import { BarChart as Plot } from "recharts";
    import { ChartValues } from "@/components/pulse/chart-values";
    export function A({ rows }: { rows: Row[] }) {
      return <div><Plot data={rows} accessibilityLayer /><Plot data={rows} accessibilityLayer={true} />
        <ChartValues caption="c" labelHeading="D" valueHeading="V" rows={rows} /></div>;
    }`;

  // Act
  const violations = findChartValuesViolations(source, "components/pulse/x-chart.tsx");

  // Assert
  assert.deepEqual(violations.map((violation) => violation.failure),
    [{ kind: "focusable-plot", plot: "BarChart" }, { kind: "focusable-plot", plot: "BarChart" }]);
});

test("an exemption from the values table does not excuse a focusable plot", () => {
  // Arrange — the exempt file is the aria-hidden miniature, where a tab stop does the most harm
  const exempt = CHART_VALUES_EXEMPTIONS[0].file;
  const source = `
    import { BarChart } from "recharts";
    export function Mini({ rows }: { rows: Row[] }) { return <BarChart data={rows} />; }`;

  // Act
  const violations = findChartValuesViolations(source, exempt);

  // Assert
  assert.deepEqual(violations.map((violation) => violation.failure),
    [{ kind: "focusable-plot", plot: "BarChart" }]);
});

test("names the switch to turn off in its focusable-plot message", () => {
  // Arrange
  const source = `import { BarChart } from "recharts";
    import { ChartValues } from "@/components/pulse/chart-values";
    export function Chart({ rows }: { rows: Row[] }) {
      return <div><BarChart data={rows} /><ChartValues caption="c" labelHeading="D" valueHeading="V" rows={rows} /></div>;
    }`;

  // Act
  const message = formatChartValuesViolations(
    findChartValuesViolations(source, "components/pulse/x-chart.tsx"));

  // Assert
  assert.match(message, /accessibilityLayer=\{false\}/);
  assert.match(message, /ADR-0084/);
});

test("does not ask the values primitive to render itself", () => {
  // Arrange — `chart-values.tsx` renders the table, not a plot; it must not be its own subject
  const source = readFileSync(
    resolve(webRoot, "components/pulse/chart-values.tsx"), "utf8");

  // Act / Assert
  assert.deepEqual(
    findChartValuesViolations(source, "components/pulse/chart-values.tsx"), []);
});

test("names the file, the line and the pairing in its failure message", () => {
  // Arrange
  const source = `import { BarChart } from "recharts";
    export function Chart({ rows }: { rows: Row[] }) { return <BarChart data={rows} />; }`;

  // Act
  const message = formatChartValuesViolations(
    findChartValuesViolations(source, "components/pulse/x-chart.tsx"));

  // Assert
  assert.match(message, /components\/pulse\/x-chart\.tsx:1/);
  assert.match(message, /<ChartValues>/);
  assert.match(message, /ADR-0084/);
});

test("every exemption carries a reason a reviewer can weigh", () => {
  // Arrange / Act / Assert — an exemption asserts a plot may withhold its values, which is
  // never self-evident
  for (const exemption of CHART_VALUES_EXEMPTIONS) {
    assert.ok(exemption.reason.length > 60,
      `${exemption.file} needs a reason, not a label`);
  }
});

test("every plot in the app renders its values as text", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findChartValuesViolations(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.deepEqual(violations, [], `\n${formatChartValuesViolations(violations)}`);
});
