// The Movement Pattern taxonomy — presentation model for the field-guide Catalog browse
// (ADR-0072). The backend classifies each catalog Exercise into one broad pattern (a
// read-time projection) and the taxonomy endpoint groups by it; this module owns the
// *presentation* side the server does not: the human label, the one-line "what this
// pattern is" blurb, and the canonical order. No server or React imports, so it is safe in
// any component and unit-testable with `node --test`.

// The wire tokens the backend emits (app/domain/movement_pattern.py). "general" is the
// honest "no single pattern dominates" bucket, always shown last.
export type MovementPattern =
  | "squat"
  | "hinge"
  | "push"
  | "pull"
  | "carry"
  | "locomotion"
  | "core"
  | "general";

// Canonical presentation order, General last — mirrors the backend PATTERN_ORDER so the
// client never re-sorts the server's already-ordered groups into a different shape.
export const PATTERN_ORDER: readonly MovementPattern[] = [
  "squat",
  "hinge",
  "push",
  "pull",
  "carry",
  "locomotion",
  "core",
  "general",
];

// Human labels for the section headers.
export const PATTERN_LABEL: Record<MovementPattern, string> = {
  squat: "Squat",
  hinge: "Hinge",
  push: "Push",
  pull: "Pull",
  carry: "Carry",
  locomotion: "Locomotion",
  core: "Core",
  general: "General",
};

// One-line "what this pattern is" blurbs, shown under each section header — the field
// guide's plain-language description of the family.
export const PATTERN_BLURB: Record<MovementPattern, string> = {
  squat: "Bend at the knees and hips to lower and stand — the primary leg pattern.",
  hinge: "Push the hips back and drive them forward — the posterior-chain pattern.",
  push: "Press a load away from you, overhead or in front.",
  pull: "Draw a load toward you, from overhead or in front.",
  carry: "Hold a load and stay braced — often while moving.",
  locomotion: "Cover ground or drive a machine — running, rowing, cycling.",
  core: "Resist or create motion through the trunk.",
  general: "A mix of movements that don't fall into one pattern.",
};

const KNOWN_PATTERNS = new Set<string>(PATTERN_ORDER);

// Resolve a raw wire value to a MovementPattern, defaulting an unknown/legacy value to
// "general" so an unexpected token from an older API never renders a broken section.
export function parseMovementPattern(value: string): MovementPattern {
  return KNOWN_PATTERNS.has(value) ? (value as MovementPattern) : "general";
}
