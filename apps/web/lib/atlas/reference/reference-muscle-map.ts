// Maps the reference artwork's coarse muscle-region labels (its `data-muscle` values) onto our
// canonical Muscle vocabulary (`apps/api/app/domain/muscles.py`, mirrored in muscle-figure-spec).
//
// The reference groups muscles more coarsely than our 40-muscle vocabulary (three deltoid heads →
// one Deltoids region; two chest regions → Pectoralis Major), so several reference labels collapse
// onto one canonical Muscle. Each region resolves to a single canonical Muscle for its heat, group
// colour, and the drawer it opens; `head` (and any unmapped shape) is decorative body, never an
// addressable muscle.

export const REFERENCE_MUSCLE_MAP: Record<string, string | null> = {
  "upper-chest": "Pectoralis Major",
  "lower-chest": "Pectoralis Major",
  abs: "Rectus Abdominis",
  obliques: "Obliques",
  "front-delts": "Deltoids",
  "side-delts": "Deltoids",
  "rear-delts": "Deltoids",
  biceps: "Biceps Brachii",
  triceps: "Triceps Brachii",
  forearms: "Forearms",
  quads: "Quadriceps",
  hamstrings: "Hamstrings",
  calves: "Gastrocnemius",
  glutes: "Gluteus Maximus",
  lats: "Latissimus Dorsi",
  traps: "Trapezius",
  "lower-back": "Erector Spinae",
  head: null,
};

// Resolve a reference region label to its canonical Muscle id, or null for decorative shapes.
export function canonicalMuscleFor(referenceLabel: string): string | null {
  return REFERENCE_MUSCLE_MAP[referenceLabel] ?? null;
}
