import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHART_THEME_FALLBACK,
  readChartTheme,
  type ChartTheme,
  type CSSVariableSource,
} from "./chart-theme.ts";

// `readChartTheme` is the pure seam under the `useChartTheme` DOM hook: it turns a
// CSS-variable source (in production, `getComputedStyle(<html>)`) into the concrete
// colours Recharts needs, so a chart tracks the live Active Skin × Mode instead of
// the frozen PULSE-dark hex it used before (ADR-0050). These tests drive the mapping
// and its per-token SSR fallback with a fake source — no browser required.

// A fake source backed by a fixed map of custom-property → value, mimicking a
// resolved `CSSStyleDeclaration.getPropertyValue`. An absent property returns ""
// exactly as the DOM does.
function fakeSource(vars: Record<string, string>): CSSVariableSource {
  return { getPropertyValue: (property) => vars[property] ?? "" };
}

test("resolves each chart colour from its --color-* custom property", () => {
  // Arrange — an Aurora-like palette stamped on the source
  const source = fakeSource({
    "--color-cyan": "#34d399",
    "--color-cyan-dim": "#34d3991f",
    "--color-violet": "#a78bfa",
    "--color-text-muted": "#6f7d9c",
    "--color-border": "#1c2438",
  });

  // Act
  const theme = readChartTheme(source);

  // Assert — every colour comes from the live variables, not the PULSE fallback
  assert.deepEqual(theme, {
    cyan: "#34d399",
    cyanDim: "#34d3991f",
    violet: "#a78bfa",
    muted: "#6f7d9c",
    border: "#1c2438",
  } satisfies ChartTheme);
});

test("trims whitespace around a resolved variable value", () => {
  // Arrange — getComputedStyle commonly returns values with a leading space
  const source = fakeSource({ "--color-cyan": "  #0070f3 " });

  // Act
  const theme = readChartTheme(source);

  // Assert — the cursor/stroke value is a clean colour string
  assert.equal(theme.cyan, "#0070f3");
});

test("falls back to the PULSE-dark value for any absent variable", () => {
  // Arrange — only one variable is present (e.g. an SSR-ish partial read)
  const source = fakeSource({ "--color-violet": "#be185d" });

  // Act
  const theme = readChartTheme(source);

  // Assert — the present one wins; the rest fall back token-by-token
  assert.equal(theme.violet, "#be185d");
  assert.equal(theme.cyan, CHART_THEME_FALLBACK.cyan);
  assert.equal(theme.cyanDim, CHART_THEME_FALLBACK.cyanDim);
  assert.equal(theme.muted, CHART_THEME_FALLBACK.muted);
  assert.equal(theme.border, CHART_THEME_FALLBACK.border);
});

test("an empty source yields the full PULSE-dark fallback", () => {
  // Arrange — no variables at all (the server-render / no-DOM case)
  const source = fakeSource({});

  // Act
  const theme = readChartTheme(source);

  // Assert — charts still render today's look rather than blank strokes
  assert.deepEqual(theme, CHART_THEME_FALLBACK);
});

test("treats a blank variable value as absent and falls back", () => {
  // Arrange — a declared-but-empty custom property resolves to whitespace
  const source = fakeSource({ "--color-cyan": "   " });

  // Act
  const theme = readChartTheme(source);

  // Assert — a blank value never reaches Recharts as a colour
  assert.equal(theme.cyan, CHART_THEME_FALLBACK.cyan);
});
