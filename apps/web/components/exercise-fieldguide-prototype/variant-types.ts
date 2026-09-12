// PROTOTYPE — Field Guide exercise discovery. Throwaway; see README.md.
//
// The one prop contract every browse variant renders against. The container owns the
// data, the "open Details" callback, and the shared-element morph naming; each variant
// is free to lay the results out however it likes (list / gallery / taxonomy).

import type { ExerciseSearchResult } from "@/lib/exercises-types";

export interface FieldGuideVariantProps {
  results: ExerciseSearchResult[];
  // Open the Details surface for one exercise.
  onOpen: (exercise: ExerciseSearchResult) => void;
  // The shared `view-transition-name` for this exercise's glyph while a morph into the
  // dialog is in flight, or undefined when it should not carry one. Wire it onto the
  // element that holds the glyph so the morph has a source to fly from.
  resolveGlyphName: (exerciseId: number) => string | undefined;
}
