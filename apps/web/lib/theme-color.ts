import type { Mode, Skin } from "./theme.ts";

// ADR-0102: the browser chrome is painted in the rendered Theme's own page colour.
//
// `themeColor` was one hardcoded hex — PULSE dark's `#09090b` — while the app ships 6
// Skins × 3 Modes. In any light Mode, and in any Skin whose page is not that near-black,
// the address bar and the iOS standalone status bar sat in a colour the page does not
// contain, which on a phone reads as a strip of someone else's app above the content.
//
// The Theme is already resolved server-side for the `<html>` attributes (ADR-0047/0048),
// so the Skin is known when the tag is emitted and only the Mode can still be open:
// System Mode stamps no `data-mode` and lets `prefers-color-scheme` decide, so it emits
// the pair of media-conditioned colours that CSS would resolve between.
//
// The page colour per Skin × Mode lives in `app/globals.css` as `--color-base`. It cannot
// be read from there at request time — it is a build artifact of the stylesheet, not a
// module — so it is restated here and `theme-color.test.ts` holds the two declarations to
// one number by parsing the stylesheet the Contrast Floor already parses.

export interface ThemeColorDescriptor {
  readonly media: string;
  readonly color: string;
}

// What Next's `Viewport.themeColor` accepts: one colour, or a list of media-conditioned
// ones.
export type ThemeColor = string | ThemeColorDescriptor[];

export interface SkinBaseColors {
  readonly dark: string;
  readonly light: string;
}

// `--color-base` for each Skin in both polarities, mirroring `app/globals.css`. The type
// makes a Skin with no page colour a compile error rather than a silent fallback to
// another Skin's chrome; `theme-color.test.ts` catches the other direction — a key here
// that the stylesheet does not declare.
export const SKIN_BASE_COLORS: Readonly<Record<Skin, SkinBaseColors>> = {
  pulse: { dark: "#09090b", light: "#ffffff" },
  aurora: { dark: "#0a0e17", light: "#f6f8fc" },
  vercel: { dark: "#000000", light: "#ffffff" },
  alpine: { dark: "#101b17", light: "#f2f5ef" },
  clay: { dark: "#211b18", light: "#f8f1e9" },
  track: { dark: "#101520", light: "#f3f5f8" },
};

// The browser-chrome colour for one rendered Theme. A stamped Mode resolves to a single
// colour; System Mode defers to the device exactly as the stylesheet does, so both
// branches are emitted and the browser picks the one its own media query matches.
export function themeColorFor(activeSkin: Skin, mode: Mode): ThemeColor {
  const base = SKIN_BASE_COLORS[activeSkin] ?? SKIN_BASE_COLORS.pulse;
  if (mode === "dark") return base.dark;
  if (mode === "light") return base.light;
  return [
    { media: "(prefers-color-scheme: dark)", color: base.dark },
    { media: "(prefers-color-scheme: light)", color: base.light },
  ];
}
