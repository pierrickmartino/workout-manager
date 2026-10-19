// View-model for one row of the catalog index (ADR-0072): the plain-language facts line under
// an exercise's name, and the anchor each Movement Pattern section answers to from the jump
// strip. No server or React imports, so it is safe in any component and unit-testable with
// `node --test`.

import { equipmentLabel } from "./equipment.ts";
import type { ExerciseSearchResult } from "./exercises-types.ts";
import type { MovementPattern } from "./movement-pattern.ts";

// Muscles spelled out on the row before the rest fold into "+N"; the full list is on Details.
export const FACTS_MUSCLE_LIMIT = 3;

const FACTS_SEPARATOR = " · ";

// The backend's coarse bands over the stored 1–10 (app/domain/exercise_browse.py
// `_BAND_RANGES`), so a row's level and the difficulty facet never disagree.
const DIFFICULTY_BANDS: ReadonlyArray<readonly [number, number, string]> = [
  [1, 3, "Beginner"],
  [4, 7, "Intermediate"],
  [8, 10, "Advanced"],
];

export function difficultyBandLabel(difficulty: number | null): string | null {
  if (difficulty === null) return null;
  const band = DIFFICULTY_BANDS.find(([low, high]) => low <= difficulty && difficulty <= high);
  return band ? band[2] : null;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function musclesPart(muscles: readonly string[]): string | null {
  if (muscles.length === 0) return null;
  const shown = muscles.slice(0, FACTS_MUSCLE_LIMIT).map(capitalize).join(", ");
  const more = muscles.length - FACTS_MUSCLE_LIMIT;
  return more > 0 ? `${shown} +${more}` : shown;
}

// Every piece of kit, not just the first: "Barbell + Rack" says what the movement needs.
function kitPart(equipment: readonly string[]): string {
  const kit = equipment.filter((item) => item !== "bodyweight");
  return kit.length === 0 ? "Bodyweight" : kit.map(equipmentLabel).join(" + ");
}

// "Quadriceps, Glutes · Barbell + Rack · Intermediate". A part with nothing to say is left
// out rather than printed blank.
export function catalogEntryFacts(exercise: ExerciseSearchResult): string {
  return [
    musclesPart(exercise.targeted_muscles),
    kitPart(exercise.equipment),
    difficultyBandLabel(exercise.difficulty),
  ]
    .filter((part): part is string => part !== null)
    .join(FACTS_SEPARATOR);
}

export function patternAnchorId(pattern: MovementPattern): string {
  return `pattern-${pattern}`;
}
