// A stable, curated fill color per Muscle Group so the split reads consistently across
// the app — the Analytics screen (Muscle Split, Muscle Balance, and the Muscle Atlas), the
// Builder's SIMULATE preview, and the Strength Analytics balance-over-time bars all share
// this one palette. The six real groups each get a **distinct** hue (ADR-0073): before the
// atlas, Legs/Arms shared cyan and Chest/Core shared violet, which is invisible on stacked
// bars but fatal on a body map where two regions would render identically. Unclassified is
// deliberately muted: it is the honest "leftovers" bucket, shown but never competing with a
// real group for the eye. Kept in one module so a color never drifts between surfaces.
export const GROUP_COLOR: Record<string, string> = {
  Legs: "bg-cyan",
  Chest: "bg-magenta",
  Back: "bg-blue",
  Shoulders: "bg-amber",
  Arms: "bg-violet",
  Core: "bg-green",
  Unclassified: "bg-text-muted",
};

// The fallback fill for any label absent from the curated map (e.g. a future group added
// server-side before the palette catches up), so a bar always renders a visible color.
export const GROUP_COLOR_FALLBACK = "bg-cyan";

// The same palette as raw CSS custom properties, for surfaces that fill with a `color`/`fill`
// value rather than a Tailwind `bg-*` utility — the atlas SVG shades each body region with
// its group's var at a computed opacity, which a utility class can't express. One source with
// GROUP_COLOR so the body map and the bars can never disagree on a group's hue.
export const GROUP_VAR: Record<string, string> = {
  Legs: "var(--color-cyan)",
  Chest: "var(--color-magenta)",
  Back: "var(--color-blue)",
  Shoulders: "var(--color-amber)",
  Arms: "var(--color-violet)",
  Core: "var(--color-green)",
  Unclassified: "var(--color-text-muted)",
};

// The fallback fill var, mirroring GROUP_COLOR_FALLBACK for the CSS-var surfaces.
export const GROUP_VAR_FALLBACK = "var(--color-cyan)";
