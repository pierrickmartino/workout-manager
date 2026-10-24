// View-model for My Sessions' facet rail (ADR-0141): the Favorites toggle, each Training Type in
// the library and each Exercise its plans prescribe, every one with how many Sessions picking it
// would show. Pure and server-free, like the `session-library` it builds on.
//
// Counts are read at render time off the already-fetched library, never stored (ADR-0018). As on
// History (ADR-0139), each facet's counts honour every *other* facet and ignore their own — the
// search counts as a facet too — so an unselected type shows what adding it brings in (types OR
// together), and the favorite and exercise counts are exactly what picking them shows.

import {
  availableTrainingTypes,
  filterSessions,
  type SessionFilterable,
  type SessionLibraryFilters,
} from "./session-library.ts";
import {
  projectExerciseFacets,
  projectTypeFacets,
  tally,
  type ExerciseFacetList,
  type FacetRailView,
  type TypeFacet,
} from "./facet-rail.ts";

export interface FavoriteFacet {
  count: number;
  selected: boolean;
}

export interface SessionsFacetRail extends ExerciseFacetList {
  favorite: FavoriteFacet;
  types: TypeFacet[];
  // The search, the favorite, each selected type and the exercise, for the phone's collapsed
  // summary.
  activeCount: number;
}

// The distinct Exercises the library's plans prescribe — the exercise facet's options. Only
// movements present in some plan are offered, since picking one no plan holds is always empty.
function exerciseOptions(summaries: readonly SessionFilterable[]): string[] {
  return [...new Set(summaries.flatMap((summary) => summary.exercise_names))];
}

// The types the rail lists: those present in the library, then any picked type it does not
// hold (a shared link's), so every pick stays on screen and can be cleared.
function offeredTypes(
  summaries: readonly SessionFilterable[],
  filters: SessionLibraryFilters,
): string[] {
  const present = availableTrainingTypes(summaries);
  return [...present, ...filters.trainingTypes.filter((type) => !present.includes(type))];
}

export function projectSessionFacets(
  summaries: readonly SessionFilterable[],
  filters: SessionLibraryFilters,
  view: FacetRailView,
): SessionsFacetRail {
  const favoriteCount = filterSessions(summaries, { ...filters, favorite: false }).filter(
    (summary) => summary.is_favorite,
  ).length;
  const typeCounts = tally(
    filterSessions(summaries, { ...filters, trainingTypes: [] }),
    (summary) => [summary.training_type],
  );
  const exerciseCounts = tally(
    filterSessions(summaries, { ...filters, exercise: null }),
    (summary) => summary.exercise_names,
  );
  const searching = filters.query.trim().length > 0;
  return {
    favorite: { count: favoriteCount, selected: filters.favorite },
    types: projectTypeFacets(offeredTypes(summaries, filters), typeCounts, filters.trainingTypes),
    ...projectExerciseFacets(exerciseOptions(summaries), exerciseCounts, filters.exercise, view),
    activeCount:
      (searching ? 1 : 0) +
      (filters.favorite ? 1 : 0) +
      filters.trainingTypes.length +
      (filters.exercise === null ? 0 : 1),
  };
}
