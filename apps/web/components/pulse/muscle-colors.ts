// A stable, curated fill color per Muscle Group so the split reads consistently across
// the app — the Analytics screen, the Builder's SIMULATE preview, and the Strength
// Analytics balance-over-time bars all share this one palette. Unclassified is
// deliberately muted: it is the honest "leftovers" bucket, shown but never competing with
// a real group for the eye. Kept in one module so a color never drifts between surfaces.
export const GROUP_COLOR: Record<string, string> = {
  Legs: "bg-cyan",
  Chest: "bg-violet",
  Back: "bg-blue",
  Shoulders: "bg-magenta",
  Arms: "bg-cyan",
  Core: "bg-violet",
  Unclassified: "bg-text-muted",
};

// The fallback fill for any label absent from the curated map (e.g. a future group added
// server-side before the palette catches up), so a bar always renders a visible color.
export const GROUP_COLOR_FALLBACK = "bg-cyan";
