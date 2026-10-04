import type { FitnessLevelStanding } from "./profile-progress-types.ts";

// PROTOTYPE — THROWAWAY. Not production code; deleted or folded in once a variant wins.
//
// Question this prototype answers: should the Profile view’s Fitness Level section show the
// Declared and Effective readings as a **visual** position on the 1–10 scale instead of the
// bare "6/10" pair it renders today (ADR-0112, `lib/fitness-level-standing.ts`)?
//
// Three variants of the section render from these rows on the existing `/profile` route,
// switchable with `?variant=A|B|C`. See `components/prototype/`.
//
// Deliberately separate from the real `fitness-level-standing.ts`: that one formats both
// readings as text ("6/10") and hands the component nothing it could draw with. A visual needs
// the **numbers** plus the span, so this view-model keeps them and adds the one derived figure
// every variant draws — the earned gap between the two readings.

// The top of the Fitness Level scale (CONTEXT: Fitness Level).
export const MAX_LEVEL = 10;

// Mirrors `CURATED_TYPE_ORDER` in the real view-model, for the same reason: strength and yoga
// read in the same place whatever order the profile happened to be saved in.
const CURATED_TYPE_ORDER: readonly string[] = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
];

// One Training Type’s standing, ready to draw. `declared` and `effective` are positions on the
// 1–`MAX_LEVEL` scale; `earned` is how far the app is planning above the Declared floor, which
// is the quantity every variant renders as a distinct zone. `readout` is the whole row as one
// sentence of text, because a drawn position has to reach a non-visual reader unchanged — the
// numbers leave the screen, not the data.
export interface FitnessLevelVisualRow {
  trainingType: string;
  declared: number;
  effective: number;
  earned: number;
  raised: boolean;
  note: string;
  readout: string;
}

// The same three sentences the shipped view-model writes, so a variant is judged on its
// drawing and not on new copy.
function relationNote(declared: number, effective: number): string {
  const earned = effective - declared;
  if (earned === 0) {
    return "Matches what you declared — nothing in your recent record moves it.";
  }
  const magnitude = Math.abs(earned);
  const levels = magnitude === 1 ? "level" : "levels";
  return earned > 0
    ? `${magnitude} ${levels} above what you declared, earned from your recent record.`
    : `${magnitude} ${levels} below what you declared.`;
}

// What a screen reader gets where a sighted reader gets a drawn position.
function readout(trainingType: string, declared: number, effective: number): string {
  return `${trainingType}: declared level ${declared} of ${MAX_LEVEL}, planning at level ${effective} of ${MAX_LEVEL}.`;
}

function curatedIndex(trainingType: string): number {
  const position = CURATED_TYPE_ORDER.indexOf(trainingType);
  return position === -1 ? CURATED_TYPE_ORDER.length : position;
}

export function toFitnessLevelVisualRows(
  standings: readonly FitnessLevelStanding[],
): FitnessLevelVisualRow[] {
  return [...standings]
    .sort(
      (left, right) =>
        curatedIndex(left.training_type) - curatedIndex(right.training_type),
    )
    .map((standing) => ({
      trainingType: standing.training_type,
      declared: standing.declared,
      effective: standing.effective,
      // Clamped at zero: a reading below Declared is a state the projection cannot produce
      // (Declared is a floor), and a negative zone would draw backwards. The note still says
      // what happened, so the row is not silent about it.
      earned: Math.max(0, standing.effective - standing.declared),
      raised: standing.effective > standing.declared,
      note: relationNote(standing.declared, standing.effective),
      readout: readout(standing.training_type, standing.declared, standing.effective),
    }));
}
