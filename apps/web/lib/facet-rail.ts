// The projection pieces a facet rail is built from (ADR-0139, ADR-0141). History and My
// Sessions each own which rows they count and which facets they honour; what they share is
// how a list of Training Types and a list of exercises become rail rows. Pure and server-free,
// so each screen's `*-facets` view-model stays a thin composition unit-tested without a browser.

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

export interface ExerciseFacetList {
  // The exercise rows on screen, the selected one always among them.
  exercises: ExerciseFacet[];
  // How many matching exercises sit behind "Show all"; 0 when the list is whole.
  hiddenExercises: number;
}

// The rail's own view state: the text in its exercise finder, and whether "Show all" is open.
// Neither narrows the rows, so neither is part of the URL.
export interface FacetRailView {
  query: string;
  expanded: boolean;
}

// How many rows carry each key.
export function tally<T>(
  rows: readonly T[],
  keysOf: (row: T) => readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const key of keysOf(row)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

// One row per offered type, in the order given, each with its count and its bar's share.
export function projectTypeFacets(
  types: readonly string[],
  counts: ReadonlyMap<string, number>,
  selected: readonly string[],
): TypeFacet[] {
  const largest = Math.max(0, ...counts.values());
  return types.map((type) => {
    const count = counts.get(type) ?? 0;
    return {
      type,
      count,
      selected: selected.includes(type),
      share: largest === 0 ? 0 : count / largest,
    };
  });
}

// The exercise rows: the options the finder matches, most-counted first (ties alphabetical),
// six before "Show all" unless it is open or the finder holds text.
export function projectExerciseFacets(
  options: readonly string[],
  counts: ReadonlyMap<string, number>,
  pick: string | null,
  view: FacetRailView,
): ExerciseFacetList {
  const toFacet = (name: string): ExerciseFacet => ({
    name,
    count: counts.get(name) ?? 0,
    selected: name === pick,
  });

  const needle = view.query.trim().toLowerCase();
  const matching = options
    .filter((name) => name.toLowerCase().includes(needle))
    .map(toFacet)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const whole = view.expanded || needle.length > 0;
  const shown = whole ? matching : matching.slice(0, EXERCISE_PREVIEW);

  // The pick stays on screen wherever it falls, so it can always be seen and cleared — even an
  // exercise from a shared link that these rows never hold.
  // A pick lifted from behind "Show all" no longer counts as hidden.
  if (pick === null || shown.some((facet) => facet.selected)) {
    return { exercises: shown, hiddenExercises: matching.length - shown.length };
  }
  const lifted = matching.some((facet) => facet.selected) ? 1 : 0;
  return {
    exercises: [toFacet(pick), ...shown],
    hiddenExercises: matching.length - shown.length - lifted,
  };
}
