import type { ContributingExercise, RecentCoverage } from "./analytics-types.ts";

// One real Muscle Group prepared for the atlas (task #9 / ADR-0025). Carries everything the
// body map and its region drawer render: the display `group`, its `covered` state as both a
// boolean and a text `stateLabel` (so nothing rides on color), the in-window `sets` count,
// the `sharePct` of in-window real-group sets for the drawer, an `intensity` (0–1) for the
// region's heat fill, the `topExercise` for the compact list row, the full
// `contributingExercises` for the drawer, and a composed `ariaLabel` naming group, state,
// window, and volume. Descriptive only — presence and volume, never a rank or a target.
export interface AtlasRegion {
  group: string;
  covered: boolean;
  stateLabel: string;
  sets: number;
  sharePct: number;
  intensity: number;
  topExercise: string | null;
  contributingExercises: ContributingExercise[];
  ariaLabel: string;
}

// The Muscle Atlas view: the labeled `weeksLabel`, the six real-group `regions` in the
// server's canonical order, a section-level `isEmpty` (true only when nothing was trained
// *and* nothing rolled up outside the six — the honest teaching-empty signal, ADR-0025), a
// neutral `footnote` disclosing off-map work (or `null`), and `unclassifiedSets` — the count
// of in-window sets that fell outside the six (0 when none). `isEmpty` and the unclassified
// disclosure are independent: a history of only unmapped work reads as six not-trained
// regions *and* carries the footnote.
export interface AtlasView {
  weeksLabel: string;
  regions: AtlasRegion[];
  isEmpty: boolean;
  footnote: string | null;
  unclassifiedSets: number;
}

const TRAINED_LABEL = "Trained";
const NOT_TRAINED_LABEL = "Not trained";

// The neutral, non-prescriptive disclosure copy (issue #189 / ADR-0025): it names that some
// recent work rolls up outside the six real groups without ranking, flagging, or nudging.
const UNCLASSIFIED_FOOTNOTE = "Some recent sets list muscles we don't map yet.";

function setsWord(sets: number): string {
  return sets === 1 ? "set" : "sets";
}

function toRegion(
  group: RecentCoverage["groups"][number],
  weeksLabel: string,
  maxSets: number,
  totalSets: number,
): AtlasRegion {
  const { covered, sets } = group;
  const stateLabel = covered ? TRAINED_LABEL : NOT_TRAINED_LABEL;
  // The aria label carries state *and* volume so a screen reader never needs the region's
  // color or fill: "Legs: trained in the last 8 weeks, 22 sets" / "Core: not trained in…".
  const ariaLabel = covered
    ? `${group.group}: trained in the ${weeksLabel}, ${sets} ${setsWord(sets)}`
    : `${group.group}: not trained in the ${weeksLabel}`;
  return {
    group: group.group,
    covered,
    stateLabel,
    sets,
    sharePct: totalSets > 0 ? Math.round((sets / totalSets) * 100) : 0,
    // Heat intensity is volume relative to the busiest group, so the body reads as a
    // gradient of what the user actually did — descriptive, never a quota fill.
    intensity: maxSets > 0 ? sets / maxSets : 0,
    topExercise: group.contributing_exercises[0]?.name ?? null,
    contributingExercises: group.contributing_exercises,
    ariaLabel,
  };
}

// Turn the API's enriched six-group coverage read into the atlas view, preserving the
// server's canonical group order (the view never reshuffles it). Pure and server-free, so
// it is safe from either a Server or Client Component.
export function toAtlasView(coverage: RecentCoverage): AtlasView {
  const weeksLabel = `last ${coverage.weeks} weeks`;
  const totalSets = coverage.groups.reduce((sum, group) => sum + group.sets, 0);
  const maxSets = coverage.groups.reduce((max, group) => Math.max(max, group.sets), 0);
  const regions = coverage.groups.map((group) =>
    toRegion(group, weeksLabel, maxSets, totalSets),
  );
  return {
    weeksLabel,
    regions,
    // The teaching empty state is for a genuinely empty window only — never for one holding
    // work that rolled up outside the six. A history of only unmapped work reads as six
    // honest not-trained regions plus the footnote (issue #189), not "no training logged".
    isEmpty: regions.every((region) => !region.covered) && !coverage.unclassified_present,
    footnote: coverage.unclassified_present ? UNCLASSIFIED_FOOTNOTE : null,
    unclassifiedSets: coverage.unclassified_sets,
  };
}
