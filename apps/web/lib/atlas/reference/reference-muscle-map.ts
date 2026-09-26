// Maps the reference artwork's coarse muscle-region labels (its `data-muscle` values) onto our
// canonical Muscle vocabulary (`apps/api/app/domain/muscles.py`, mirrored in muscle-figure-spec).
//
// The reference groups muscles far more coarsely than our 40-muscle vocabulary: only 14 canonical
// muscles have a region of their own. `REFERENCE_REGION_MUSCLES` is the display roster — every
// canonical Muscle drawn in a given region, listing the region's own muscle first and then the
// deeper or adjacent muscles that have no shape of their own and are shown on their nearest
// neighbour (Soleus on `calves`, Rhomboids on `traps`, Transverse Abdominis on `abs`, …). That
// keeps the figure from going dark for an exercise whose prime mover the artwork can't draw.
//
// The approximation is display-only and is why the exercise figure stays decorative: the exact
// muscles are always named in the text beside it, so nothing rides on the illustration. The atlas,
// which must resolve a tap to exactly one muscle, uses each region's **first** entry
// (`REFERENCE_MUSCLE_MAP`), derived here so the two can never drift.

export const REFERENCE_REGION_MUSCLES: Record<string, string[]> = {
  "upper-chest": ["Pectoralis Major", "Pectoralis Minor"],
  "lower-chest": ["Pectoralis Major", "Pectoralis Minor"],
  abs: ["Rectus Abdominis", "Transverse Abdominis"],
  obliques: ["Obliques", "Serratus Anterior"],
  "front-delts": ["Deltoids"],
  "side-delts": ["Deltoids"],
  // The cuff sits under the rear shoulder, so the deep rotators ride here.
  "rear-delts": ["Deltoids", "Supraspinatus", "Infraspinatus", "Teres Minor", "Rotator Cuff"],
  biceps: ["Biceps Brachii", "Brachialis", "Coracobrachialis"],
  triceps: ["Triceps Brachii", "Anconeus"],
  forearms: ["Forearms", "Brachioradialis"],
  quads: ["Quadriceps", "Hip Adductors", "Hip Flexors", "Sartorius", "Tensor Fasciae Latae"],
  hamstrings: ["Hamstrings"],
  calves: ["Gastrocnemius", "Soleus", "Tibialis Anterior", "Peroneals"],
  glutes: ["Gluteus Maximus", "Gluteus Medius", "Gluteus Minimus", "Hip Abductors"],
  lats: ["Latissimus Dorsi", "Teres Major"],
  traps: ["Trapezius", "Rhomboids", "Levator Scapulae"],
  "lower-back": ["Erector Spinae", "Quadratus Lumborum", "Multifidus"],
  // Decorative body, never an addressable muscle.
  head: [],
};

// Each region's own canonical Muscle — the one a tap on the atlas resolves to, and the one whose
// coverage drives that region's heat. Derived from the roster above so it can never drift.
export const REFERENCE_MUSCLE_MAP: Record<string, string | null> = Object.fromEntries(
  Object.entries(REFERENCE_REGION_MUSCLES).map(([region, muscles]) => [region, muscles[0] ?? null]),
);

// Resolve a reference region label to its canonical Muscle id, or null for decorative shapes.
export function canonicalMuscleFor(referenceLabel: string): string | null {
  return REFERENCE_MUSCLE_MAP[referenceLabel] ?? null;
}

// Every canonical Muscle drawn in a region — the region's own muscle plus the deeper ones shown
// on it. Used by the exercise figure, which lights a region when any of its muscles is worked.
export function musclesShownIn(referenceLabel: string): string[] {
  return REFERENCE_REGION_MUSCLES[referenceLabel] ?? [];
}
