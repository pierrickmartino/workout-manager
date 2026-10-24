// View-model for History's facet rail (ADR-0139): every Training Type and every logged exercise,
// each with how many Logged Sessions picking it would show. Pure and server-free, like the
// `history-filter` it builds on, so it is unit-tested without a browser.
//
// Counts are read at render time off the History index (ADR-0128), never stored. Each facet's
// counts honour the *other* facet and ignore their own: a type's count is "sessions of this type
// with the chosen exercise", so an unselected type shows what adding it brings in (types OR
// together, ADR-0031 Q7), and an exercise's count is "sessions with this exercise of the chosen
// types", so picking it shows exactly that many. The row shapes are shared with My Sessions'
// rail (`facet-rail`, ADR-0141).

import type { HistoryIndexRow } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";
import { deriveExerciseOptions, filterHistory, type HistoryFacets } from "./history-filter.ts";
import {
  projectExerciseFacets,
  projectTypeFacets,
  tally,
  type ExerciseFacetList,
  type FacetRailView,
  type TypeFacet,
} from "./facet-rail.ts";

export { EXERCISE_PREVIEW } from "./facet-rail.ts";

export interface HistoryFacetRail extends ExerciseFacetList {
  types: TypeFacet[];
  // The selected types plus the selected exercise, for the phone's collapsed summary.
  activeCount: number;
}

type Row = Pick<HistoryIndexRow, "training_type" | "exercise_names">;

export function projectHistoryFacets(
  index: readonly Row[],
  facets: HistoryFacets,
  view: FacetRailView,
): HistoryFacetRail {
  const typeCounts = tally(
    filterHistory(index, { exercise: facets.exercise, trainingTypes: [] }),
    (row) => [row.training_type],
  );
  const exerciseCounts = tally(
    filterHistory(index, { exercise: null, trainingTypes: facets.trainingTypes }),
    (row) => row.exercise_names,
  );
  return {
    types: projectTypeFacets(TRAINING_TYPES, typeCounts, facets.trainingTypes),
    ...projectExerciseFacets(
      deriveExerciseOptions(index),
      exerciseCounts,
      facets.exercise,
      view,
    ),
    activeCount: facets.trainingTypes.length + (facets.exercise === null ? 0 : 1),
  };
}
