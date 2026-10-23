// The Training Type → accent-colour map for the Workout Signature sigil (GLOSSARY: Workout
// Signature, Training Type). Pure and server-free, so it is unit-tested without a browser.
//
// The sibling `training-type-badge.ts` maps a Training Type to a Badge *variant* for the text
// label; this map gives the sigil its *fill hue*. Both must always render together — colour is
// never the sole carrier of the Training Type (the sigil is always accompanied by the type
// label). The Pulse system exposes three accent hues (cyan / violet / magenta) plus a fourth
// (blue) and the neutral text ramp, all Skin-aware (ADR-0050), so a sigil coded to one of these
// tokens recolours per Skin like everything else. The five curated types spread across the four
// accents plus the neutral muted rung; an uncurated type falls back to muted — a legible neutral,
// never a missing colour. A fixed, curated map — the same species as the Training Type set.

// The CSS custom-property names this map may return — consumed as `var(<name>)` by the sigil so
// it stays Skin-aware. A subset of the tokens declared in globals.css.
export type TrainingTypeAccentVar =
  | "--color-cyan"
  | "--color-magenta"
  | "--color-violet"
  | "--color-blue"
  | "--color-text-muted";

const TYPE_ACCENTS: Record<string, TrainingTypeAccentVar> = {
  strength: "--color-cyan",
  cardio: "--color-magenta",
  hiit: "--color-violet",
  yoga: "--color-blue",
  mobility: "--color-text-muted",
};

// The accent CSS variable for a Training Type. An unknown/uncurated type falls back to the
// neutral muted token so a sigil always has a visible, legible fill.
export function trainingTypeAccentVar(trainingType: string): TrainingTypeAccentVar {
  return TYPE_ACCENTS[trainingType] ?? "--color-text-muted";
}

// A Skin-aware tint of an accent variable at the given alpha (0–1), via color-mix so it tracks
// the resolved token value. Used for the sigil's quieter fills (base polygon, medallion wash).
export function accentTint(accentVar: TrainingTypeAccentVar, alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, var(${accentVar}) ${pct}%, transparent)`;
}

// The same accent as a background utility, for History's Month view, whose day cells mark each
// Logged Session in its Training Type's colour (ADR-0138). Keyed by the accent variable, so the
// mark can never drift from the sigil. Literal class names, so Tailwind sees each one. A mark
// carries no text, and the cell's accessible name and the month's legend name every type, so
// colour is never the only carrier of the Training Type.
const ACCENT_FILLS: Record<TrainingTypeAccentVar, string> = {
  "--color-cyan": "bg-cyan",
  "--color-magenta": "bg-magenta",
  "--color-violet": "bg-violet",
  "--color-blue": "bg-blue",
  "--color-text-muted": "bg-text-muted",
};

export function trainingTypeFillClass(trainingType: string): string {
  return ACCENT_FILLS[trainingTypeAccentVar(trainingType)];
}
