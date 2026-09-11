// The pure half of chart theming (ADR-0050). Recharts paints SVG stroke/fill with
// concrete JS strings, not Tailwind classes, so the charts can't read the semantic
// `--color-*` utilities the way the rest of the app does — they historically froze
// literal PULSE-dark hex, which meant charts ignored both the Active Skin *and* the
// user's Mode. This module resolves the handful of chart colours from live CSS
// custom properties instead, so a chart tracks whatever Skin × Mode is stamped on
// <html>. The DOM read (getComputedStyle + a MutationObserver) lives in the thin
// `useChartTheme` client hook; everything here is pure and unit-testable — the
// mapping from a CSS-variable source to a `ChartTheme`, plus the SSR fallback.

// The colours the three analytics charts actually draw with: the two lead accents
// (cyan for volume/top-set, violet for distance), the translucent dim used for the
// earlier top-set bars, and the muted/border greys for axes and cursors.
export interface ChartTheme {
  cyan: string;
  cyanDim: string;
  violet: string;
  muted: string;
  border: string;
}

// Which `--color-*` custom property backs each chart colour. `cyanDim` maps to the
// real `--color-cyan-dim` token (a translucent accent) rather than the solid teal
// the old top-set chart hardcoded — so the dim bars are now theme-true (ADR-0050).
const CHART_TOKENS: Record<keyof ChartTheme, string> = {
  cyan: "--color-cyan",
  cyanDim: "--color-cyan-dim",
  violet: "--color-violet",
  muted: "--color-text-muted",
  border: "--color-border",
};

// The SSR / first-paint fallback: the PULSE **dark** token values, byte-for-byte
// the look charts had before this change. Used when there is no DOM to read (server
// render) or a variable resolves empty, so a chart never paints with blank strokes.
export const CHART_THEME_FALLBACK: ChartTheme = {
  cyan: "#29e7e0",
  cyanDim: "#29e7e01f",
  violet: "#9a6bff",
  muted: "#71717a",
  border: "#27272a",
};

// A minimal read-only view of a resolved style declaration — exactly the one method
// `readChartTheme` needs. `CSSStyleDeclaration` structurally satisfies this, so the
// hook passes `getComputedStyle(html)` straight in, while a test passes a fake.
export interface CSSVariableSource {
  getPropertyValue(property: string): string;
}

// Resolve a ChartTheme from a CSS-variable source, falling back per-token to the
// PULSE-dark value when a variable is absent or blank. Pure: same source, same
// result, no I/O — this is the TDD seam the DOM hook wraps.
export function readChartTheme(source: CSSVariableSource): ChartTheme {
  const keys = Object.keys(CHART_TOKENS) as (keyof ChartTheme)[];
  return keys.reduce((theme, key) => {
    const value = source.getPropertyValue(CHART_TOKENS[key]).trim();
    return { ...theme, [key]: value || CHART_THEME_FALLBACK[key] };
  }, CHART_THEME_FALLBACK);
}
