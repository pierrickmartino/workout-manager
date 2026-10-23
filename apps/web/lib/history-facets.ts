// View-model for History's facet rail (ADR-0139): every Training Type and every logged exercise,
// each with how many Logged Sessions picking it would show. Pure and server-free, like the
// `history-filter` it builds on, so it is unit-tested without a browser.
//
// Counts are read at render time off the History index (ADR-0128), never stored. Each facet's
// counts honour the *other* facet and ignore their own: a type's count is "sessions of this type
// with the chosen exercise", so an unselected type shows what adding it brings in (types OR
// together, ADR-0031 Q7), and an exercise's count is "sessions with this exercise of the chosen
// types", so picking it shows exactly that many.

import type { HistoryIndexRow } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";
import { deriveExerciseOptions, filterHistory, type HistoryFacets } from "./history-filter.ts";

// How many exercises the rail lists before "Show all".
export const EXERCISE_PREVIEW = 6;

export interface TypeFacet {
  type: string;
  count: number;
  selected: boolean;
  // The count against the largest type count, 0–1, for the bar under the row.
  share: number;
}

export interface ExerciseFacet {
  name: string;
  count: number;
  selected: boolean;
}

export interface HistoryFacetRail {
  types: TypeFacet[];
  // The exercise rows on screen, the selected one always among them.
  exercises: ExerciseFacet[];
  // How many matching exercises sit behind "Show all"; 0 when the list is whole.
  hiddenExercises: number;
  // The selected types plus the selected exercise, for the phone's collapsed summary.
  activeCount: number;
}

// The rail's own view state: the text in its exercise finder, and whether "Show all" is open.
// Neither narrows the record, so neither is part of the URL.
export interface FacetRailView {
  query: string;
  expanded: boolean;
}

type Row = Pick<HistoryIndexRow, "training_type" | "exercise_names">;

function tally<T>(rows: readonly T[], keysOf: (row: T) => readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const key of keysOf(row)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function projectTypes(index: readonly Row[], facets: HistoryFacets): TypeFacet[] {
  const counts = tally(
    filterHistory(index, { exercise: facets.exercise, trainingTypes: [] }),
    (row) => [row.training_type],
  );
  const largest = Math.max(0, ...counts.values());
  return TRAINING_TYPES.map((type) => {
    const count = counts.get(type) ?? 0;
    return {
      type,
      count,
      selected: facets.trainingTypes.includes(type),
      share: largest === 0 ? 0 : count / largest,
    };
  });
}

function projectExercises(
  index: readonly Row[],
  facets: HistoryFacets,
  view: FacetRailView,
): Pick<HistoryFacetRail, "exercises" | "hiddenExercises"> {
  const counts = tally(
    filterHistory(index, { exercise: null, trainingTypes: facets.trainingTypes }),
    (row) => row.exercise_names,
  );
  const toFacet = (name: string): ExerciseFacet => ({
    name,
    count: counts.get(name) ?? 0,
    selected: name === facets.exercise,
  });

  const needle = view.query.trim().toLowerCase();
  const matching = deriveExerciseOptions(index)
    .filter((name) => name.toLowerCase().includes(needle))
    .map(toFacet)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const whole = view.expanded || needle.length > 0;
  const shown = whole ? matching : matching.slice(0, EXERCISE_PREVIEW);

  // The pick stays on screen wherever it falls, so it can always be seen and cleared — even an
  // exercise from a shared link that this record never performed.
  // A pick lifted from behind "Show all" no longer counts as hidden.
  const pick = facets.exercise;
  if (pick === null || shown.some((facet) => facet.selected)) {
    return { exercises: shown, hiddenExercises: matching.length - shown.length };
  }
  const lifted = matching.some((facet) => facet.selected) ? 1 : 0;
  return {
    exercises: [toFacet(pick), ...shown],
    hiddenExercises: matching.length - shown.length - lifted,
  };
}

export function projectHistoryFacets(
  index: readonly Row[],
  facets: HistoryFacets,
  view: FacetRailView,
): HistoryFacetRail {
  return {
    types: projectTypes(index, facets),
    ...projectExercises(index, facets, view),
    activeCount: facets.trainingTypes.length + (facets.exercise === null ? 0 : 1),
  };
}
