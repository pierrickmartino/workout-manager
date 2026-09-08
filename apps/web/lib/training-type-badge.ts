// The Training Type → Badge variant map for the My Sessions row (issue #397, Q9). Pure and
// server-free, so it is unit-tested without a browser.
//
// The Pulse design system deliberately exposes only three accent hues (cyan / violet /
// magenta) — and they recolor per Skin (ADR-0050), so a badge coded to one of them stays
// theme-aware. Inventing fixed hues (lime, amber…) for the two remaining Training Types would
// break that Skin-awareness, so the five curated types map onto the three accents plus the two
// neutral treatments (`outline` / `muted`). A fixed, curated map — the same species as the
// Training Type set itself — never AI- or user-derived.

// The Badge variants this map may return — a subset of the component's variants, kept in sync
// with `components/ui/badge.tsx`.
export type TrainingTypeBadgeVariant =
  | "cyan"
  | "violet"
  | "magenta"
  | "outline"
  | "muted";

const TYPE_VARIANTS: Record<string, TrainingTypeBadgeVariant> = {
  strength: "cyan",
  cardio: "magenta",
  hiit: "violet",
  yoga: "outline",
  mobility: "muted",
};

// The Badge variant for a Training Type. An unknown/uncurated type falls back to `muted` — a
// neutral pill rather than a missing style — so a stored type outside the curated set still
// renders a legible badge.
export function trainingTypeBadgeVariant(
  trainingType: string,
): TrainingTypeBadgeVariant {
  return TYPE_VARIANTS[trainingType] ?? "muted";
}
