"use client";

import { useEffect, useState } from "react";

import {
  CHART_THEME_FALLBACK,
  readChartTheme,
  type ChartTheme,
} from "./chart-theme";

// The DOM-bound half of chart theming (ADR-0050). It resolves the chart colours
// from the CSS custom properties on <html>, so a Recharts chart tracks whatever
// Active Skin × Mode is stamped there — including an admin's client-side Skin
// preview, which swaps `data-skin` live. The pure mapping lives in `readChartTheme`
// (chart-theme.ts, unit-tested); this hook only wires up the read.
//
// First render returns the PULSE-dark fallback so the server and the client's first
// paint agree (no hydration mismatch). An effect then reads the real variables after
// mount and, because <html> already carries the correct attributes from the server,
// resolves the true Skin × Mode immediately — the fallback is only ever a one-frame
// bootstrap, and the negligible flash was accepted in design (Q9c).
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(CHART_THEME_FALLBACK);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(readChartTheme(getComputedStyle(root)));

    sync();

    // Re-resolve when the Skin or Mode attributes change without a full navigation
    // (notably the admin Skin preview), so previewed charts recolour in step.
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-skin", "data-mode"],
    });

    // System Mode stamps *no* `data-mode` — its polarity comes from the device via
    // `prefers-color-scheme`, so a user flipping their OS light/dark with the page
    // open changes the resolved variables without mutating any attribute. Watch the
    // media query too, so those charts recolour instead of holding stale colours.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);

  return theme;
}
