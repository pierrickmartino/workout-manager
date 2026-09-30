import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findRechartsImportViolations,
  formatRechartsImportViolations,
  importsRecharts,
  resolveSpecifier,
  staticImports,
  RECHARTS_IMPORT_EXEMPTIONS,
} from "./recharts-import-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

// The same two roots `chart-values-policy` and `motion-policy` sweep: every component, and
// every page, since nothing stops a route from importing a chart directly. `audit/` is
// deliberately out — it is the browser harness, not a product surface, and it *must* import
// the chart components statically to mount them for the per-point parity assertion.
function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

function plotModules(files: readonly string[]): ReadonlySet<string> {
  return new Set(files.filter((file) =>
    importsRecharts(readFileSync(resolve(webRoot, file), "utf8"), file)));
}

test("flags a static import of a plot module", () => {
  // Arrange — the shape all three call sites had before this guard
  const source = `
    import { TopSetTrendChart } from "@/components/exercise/top-set-trend-chart";
    export function Panel() { return <TopSetTrendChart rows={[]} />; }`;

  // Act
  const violations = findRechartsImportViolations(
    source,
    "components/exercise/specs-panel.tsx",
    new Set(["components/exercise/top-set-trend-chart.tsx"]),
  );

  // Assert
  assert.equal(violations.length, 1);
  assert.equal(violations[0].imported, "components/exercise/top-set-trend-chart.tsx");
});

test("accepts a plot module reached through next/dynamic", () => {
  // Arrange — the pattern `volume-chart-wide.tsx` establishes. The specifier sits in a
  // call expression, not an import declaration, which is the whole distinction.
  const source = `
    "use client";
    import dynamic from "next/dynamic";
    const Chart = dynamic(
      () => import("@/components/pulse/volume-chart").then((m) => m.VolumeChart),
      { ssr: false },
    );
    export function Lazy({ rows }: { rows: Row[] }) { return <Chart rows={rows} />; }`;

  // Act / Assert
  assert.deepEqual(
    findRechartsImportViolations(
      source,
      "components/pulse/volume-chart-lazy.tsx",
      new Set(["components/pulse/volume-chart.tsx"]),
    ),
    [],
  );
});

test("accepts a type-only import of a plot module", () => {
  // Arrange — erased before the bundler sees it, so it costs no bytes
  const source = `
    import type { TopSetTrendChartProps } from "@/components/exercise/top-set-trend-chart";
    export type Props = TopSetTrendChartProps;`;

  // Act / Assert
  assert.deepEqual(
    findRechartsImportViolations(
      source,
      "components/exercise/specs-panel.tsx",
      new Set(["components/exercise/top-set-trend-chart.tsx"]),
    ),
    [],
  );
});

test("resolves a relative specifier against the importing file's directory", () => {
  // Arrange / Act
  const candidates = resolveSpecifier("../pulse/volume-chart", "components/exercise/panel.tsx");

  // Assert
  assert.ok(candidates.includes("components/pulse/volume-chart.tsx"),
    `expected components/pulse/volume-chart.tsx in ${candidates.join(", ")}`);
});

test("does not ask a plot module to answer for importing its own siblings", () => {
  // Arrange — a chart importing a shared axis helper is already behind whatever gate its
  // own importers set up; the rule is about product surfaces reaching in.
  const source = `
    import { BarChart } from "recharts";
    import { SharedAxis } from "@/components/pulse/volume-chart";
    export function Chart() { return <BarChart><SharedAxis /></BarChart>; }`;

  // Act / Assert
  assert.deepEqual(
    findRechartsImportViolations(
      source,
      "components/pulse/distance-chart.tsx",
      new Set(["components/pulse/distance-chart.tsx", "components/pulse/volume-chart.tsx"]),
    ),
    [],
  );
});

test("is not satisfied by a module path that merely appears in a comment or a string", () => {
  // Arrange — the reason this reads TypeScript rather than bytes
  const source = `
    // import { VolumeChart } from "@/components/pulse/volume-chart";
    const note = 'import { VolumeChart } from "@/components/pulse/volume-chart";';
    export function Card() { return <div>{note}</div>; }`;

  // Act / Assert
  assert.deepEqual(
    findRechartsImportViolations(
      source,
      "components/pulse/card.tsx",
      new Set(["components/pulse/volume-chart.tsx"]),
    ),
    [],
  );
});

test("recognises a plot module by its recharts import, whatever it names", () => {
  // Arrange — a fixed list of known chart exports would wave the next one through
  const source = `import { FutureChart } from "recharts";
    export function Chart() { return <FutureChart />; }`;

  // Act / Assert
  assert.equal(importsRecharts(source, "components/pulse/future-chart.tsx"), true);
});

test("does not count recharts reached through a dynamic import as a plot module", () => {
  // Arrange — a wrapper is not the thing it wraps
  const source = `const R = () => import("recharts");`;

  // Act / Assert
  assert.equal(staticImports(source, "components/pulse/x.tsx").length, 0);
  assert.equal(importsRecharts(source, "components/pulse/x.tsx"), false);
});

test("names the file, the line, the module and the remedy in its failure message", () => {
  // Arrange
  const source = `import { VolumeChart } from "@/components/pulse/volume-chart";
    export function Page() { return <VolumeChart rows={[]} />; }`;

  // Act
  const message = formatRechartsImportViolations(findRechartsImportViolations(
    source, "app/analytics/page.tsx", new Set(["components/pulse/volume-chart.tsx"])));

  // Assert
  assert.match(message, /app\/analytics\/page\.tsx:1/);
  assert.match(message, /components\/pulse\/volume-chart\.tsx/);
  assert.match(message, /next\/dynamic/);
  assert.match(message, /ADR-0090/);
});

test("every exemption carries a reason a reviewer can weigh", () => {
  // Arrange / Act / Assert — an exemption asserts a route may carry a charting library it
  // might never draw with, which is never self-evident
  for (const exemption of RECHARTS_IMPORT_EXEMPTIONS) {
    assert.ok(exemption.reason.length > 60,
      `${exemption.file} needs a reason, not a label`);
  }
});

test("the plot modules the app has are the three charts, reached only dynamically", () => {
  // Arrange — a sanity check on the sweep's own subject: if this set ever empties, the
  // sweep below passes for the wrong reason.
  const files = componentSources();

  // Act
  const plots = plotModules(files);

  // Assert
  assert.deepEqual([...plots].sort(), [
    "components/exercise/top-set-trend-chart.tsx",
    "components/pulse/distance-chart.tsx",
    "components/pulse/volume-chart.tsx",
  ]);
});

test("no product surface statically imports a chart", () => {
  // Arrange
  const files = componentSources();
  const plots = plotModules(files);

  // Act
  const violations = files.flatMap((file) => findRechartsImportViolations(
    readFileSync(resolve(webRoot, file), "utf8"), file, plots));

  // Assert
  assert.deepEqual(violations, [], `\n${formatRechartsImportViolations(violations)}`);
});
