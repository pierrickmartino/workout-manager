// PROTOTYPE — throwaway. The deterministic "workout identity" engine behind the cover
// prototype (/prototype/workout-covers). This is the load-bearing custom work the design
// question hinges on: a stable mapping from (workout id + exercise list + training type) to a
// palette + a reproducible stream of pseudo-random values the cover graphics draw from.
//
// It is deliberately PURE and framework-free so, if a cover treatment wins, this mapping can be
// lifted into real code (lib/) and unit-tested without a browser. The three variant components
// own the *treatment* (blocks / sigil / strata); this module owns only the *mapping*.
//
// Stability contract:
//   - Same id + same exercise list  → byte-identical identity every render, every screen.
//   - Two workouts that differ in id OR exercise list → different identity (so the two
//     "Calisthenics" library entries never collide).

// 32-bit FNV-1a over a string — small, fast, dependency-free, good enough for decorative art.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Math.imul keeps the multiply in 32-bit space (the FNV prime is 0x01000193).
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// A deterministic float in [0, 1) for a given seed + salt. Callers pass a stable salt string
// (e.g. "rotation", "node:3") so each independent visual dimension draws its own reproducible
// value without correlating with the others.
function seededUnit(seed: string, salt: string): number {
  return fnv1a(`${seed}::${salt}`) / 0x100000000;
}

// The minimal workout shape the cover needs — a subset of the real SessionSummary plus the
// exercise names (available from each plan's detail read, per the prompt).
export interface CoverWorkout {
  id: number | string;
  name: string;
  trainingType: string;
  exercises: string[];
}

// The five curated Training Types map onto the Pulse accent tokens (skin-aware, so a cover
// recolors with the Active Skin like the rest of the app — never a hardcoded hue). Mirrors the
// spirit of lib/training-type-badge.ts but spreads across all four accent slots plus a neutral
// so the five types are distinguishable at a glance. ALWAYS paired with the text label per the
// brief — colour is never the sole carrier.
const TYPE_ACCENT: Record<string, string> = {
  strength: "--color-cyan",
  cardio: "--color-magenta",
  hiit: "--color-violet",
  yoga: "--color-blue",
  mobility: "--color-text-muted",
};

const FALLBACK_ACCENT = "--color-text-muted";

// The resolved identity a cover treatment draws from.
export interface WorkoutIdentity {
  seed: string;
  // The CSS custom-property name for this workout's training-type hue, e.g. "--color-cyan".
  // Consumed as `var(<accentVar>)` so it stays skin-aware.
  accentVar: string;
  typeLabel: string;
  // One weight in [0.35, 1] per exercise, in prescription order ("a consistent order"). Derived
  // from the exercise name so the same movement contributes the same-sized block wherever it
  // appears — cross-workout visual rhyme, not just per-workout stability.
  exerciseWeights: number[];
  // A deterministic float in [0, 1) for an arbitrary salt — the variant graphics use this for
  // rotation, node selection, jitter, etc. Same seed + salt ⇒ same value, always.
  rand: (salt: string) => number;
  // A deterministic integer in [min, max] for a salt — convenience over `rand`.
  randInt: (salt: string, min: number, max: number) => number;
}

// Build the stable identity for a workout. The seed folds in the id AND the ordered exercise
// list, so re-running or re-copying the *same* plan reproduces the mark while two same-named but
// differently-composed workouts diverge.
export function createWorkoutIdentity(workout: CoverWorkout): WorkoutIdentity {
  const seed = `${workout.id}|${workout.trainingType}|${workout.exercises.join(">")}`;
  const rand = (salt: string): number => seededUnit(seed, salt);
  const randInt = (salt: string, min: number, max: number): number =>
    min + Math.floor(rand(salt) * (max - min + 1));

  const exerciseWeights = workout.exercises.map(
    (exercise, index) => 0.35 + 0.65 * seededUnit(seed, `weight:${index}:${exercise}`),
  );

  return {
    seed,
    accentVar: TYPE_ACCENT[workout.trainingType] ?? FALLBACK_ACCENT,
    typeLabel: workout.trainingType,
    exerciseWeights,
    rand,
    randInt,
  };
}

// A skin-aware tint of the workout's accent at the given alpha (0–1), via color-mix so it tracks
// the CSS variable. Used for the quieter fills in the block spectrum and strata bands.
export function accentTint(accentVar: string, alpha: number): string {
  const pct = Math.round(alpha * 100);
  return `color-mix(in srgb, var(${accentVar}) ${pct}%, transparent)`;
}
