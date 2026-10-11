"use client";

import { useSyncExternalStore } from "react";

import {
  CHART_THEME_FALLBACK,
  readChartTheme,
  sameChartTheme,
  type ChartTheme,
} from "./chart-theme";
import { createSharedStore } from "./shared-store";

// The DOM-bound half of chart theming (ADR-0050). It resolves the chart colours
// from the CSS custom properties on <html>, so a Recharts chart tracks whatever
// Active Skin × Mode is stamped there — including an admin's client-side Skin
// preview, which swaps `data-skin` live. The pure mapping lives in `readChartTheme`
// (chart-theme.ts, unit-tested); this hook only wires up the read.
//
// Server rendering and hydration read the PULSE-dark fallback so the server and the
// client's first paint agree (no hydration mismatch); because <html> already carries
// the correct attributes, the true Skin × Mode resolves right after hydrating — the
// negligible flash was accepted in design (Q9c). A chart mounted later (a client
// navigation, a lazy chunk) reads the real colours on its first render. One shared
// observer and media listener serve every chart on the page.
const chartTheme = createSharedStore<ChartTheme>({
  read: () => readChartTheme(getComputedStyle(document.documentElement)),
  watch: (onChange) => {
    // Re-resolve when the Skin or Mode attributes change without a full navigation
    // (notably the admin Skin preview), so previewed charts recolour in step.
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-skin", "data-mode"],
    });

    // System Mode stamps *no* `data-mode` — its polarity comes from the device via
    // `prefers-color-scheme`, so a user flipping their OS light/dark with the page
    // open changes the resolved variables without mutating any attribute. Watch the
    // media query too, so those charts recolour instead of holding stale colours.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onChange);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", onChange);
    };
  },
  equals: sameChartTheme,
});

function serverSnapshot(): ChartTheme {
  return CHART_THEME_FALLBACK;
}

export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(
    chartTheme.subscribe,
    chartTheme.getSnapshot,
    serverSnapshot,
  );
}
