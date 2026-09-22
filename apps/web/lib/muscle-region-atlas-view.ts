import type {
  ContributingExercise,
  MuscleCoverage,
  RecentCoverage,
} from "./analytics-types.ts";
import {
  NOT_TRAINED_LABEL,
  TRAINED_LABEL,
  UNCLASSIFIED_FOOTNOTE,
  coverageAriaLabel,
} from "./muscle-atlas-labels.ts";

// One individual Muscle prepared as a heat-shaded region of the anatomical atlas (issue #541 /
// ADR-0073/0078). Carries everything the body map and its list render: the display `muscle`
// name and its parent `group`, its `covered` state as both a boolean and a text `stateLabel`
// (so nothing rides on color), the in-window `sets` count behind it, an `intensity` (0–1) for
// the region's heat fill scaled to the busiest muscle, the full `contributingExercises`, and a
// composed `ariaLabel` naming muscle, state, window, and volume. Descriptive only — presence
// and volume, never a rank or a target.
export interface MuscleRegion {
  muscle: string;
  group: string;
  covered: boolean;
  stateLabel: string;
  sets: number;
  intensity: number;
  contributingExercises: ContributingExercise[];
  ariaLabel: string;
}

// One Muscle Group band of the two-level text structure (issue #541): the display `group`, its
// `covered` state rolled up from its muscles (as a boolean and a text `stateLabel`), how many
// of its muscles were trained (`trainedCount` of `muscleCount`), the `muscles` nested under it
// in the server's canonical order, and a composed `ariaLabel` naming group, state, and window.
// The band lets the section stay fully legible without the illustration: six groups the reader
// expands to their muscles.
export interface MuscleGroupSection {
  group: string;
  covered: boolean;
  stateLabel: string;
  trainedCount: number;
  muscleCount: number;
  muscles: MuscleRegion[];
  ariaLabel: string;
}

// The muscle-granularity Muscle Atlas view (issue #541): the labeled `weeksLabel`, the flat
// per-muscle `regions` the body map shades (in the server's canonical order), the two-level
// `groups`→muscles text structure over the very same region objects, a section-level `isEmpty`
// (true only when nothing was trained *and* nothing rolled up off-map — the honest teaching
// empty, ADR-0025/0073), a neutral `footnote` disclosing off-map work (or `null`), and
// `unclassifiedVolume` — the emphasis weight that named neither a muscle nor a group (0 when
// none). `isEmpty` and the unclassified disclosure are independent: a history of only unmapped
// work reads as all not-trained regions *and* carries the footnote.
export interface MuscleRegionAtlasView {
  weeksLabel: string;
  regions: MuscleRegion[];
  groups: MuscleGroupSection[];
  isEmpty: boolean;
  footnote: string | null;
  unclassifiedVolume: number;
}

function toRegion(
  item: MuscleCoverage,
  weeksLabel: string,
  maxVolume: number,
): MuscleRegion {
  const covered = item.present;
  // The in-window set count is exactly the sets behind the muscle: an exercise is credited once
  // per set that trained it, so summing the contributing exercises reconstitutes the count
  // without a separate field. A muscle lit only by a coarse group-level term still counts the
  // sets that named that group.
  const sets = item.contributing_exercises.reduce((total, exercise) => total + exercise.sets, 0);
  return {
    muscle: item.muscle,
    group: item.group,
    covered,
    stateLabel: covered ? TRAINED_LABEL : NOT_TRAINED_LABEL,
    sets,
    // Heat intensity is emphasis-weighted volume relative to the busiest muscle, so the body
    // reads as a gradient of what the user actually did — descriptive, never a quota fill.
    intensity: maxVolume > 0 ? item.volume / maxVolume : 0,
    contributingExercises: item.contributing_exercises,
    // The aria label carries state *and* volume so a screen reader never needs the region's
    // color or fill: "Quadriceps: trained in the last 8 weeks, 8 sets" / "…: not trained in…".
    ariaLabel: coverageAriaLabel(item.muscle, weeksLabel, covered, sets),
  };
}

// Partition the flat regions into their parent-group bands, preserving the server's canonical
// order in both dimensions: groups appear in first-seen order (the muscle rows already run
// Legs→Chest→Back→Shoulders→Arms→Core), and each band's muscles keep their read order. The view
// never reshuffles — it only nests.
function toGroupSections(
  regions: MuscleRegion[],
  weeksLabel: string,
): MuscleGroupSection[] {
  const order: string[] = [];
  const byGroup = new Map<string, MuscleRegion[]>();
  for (const region of regions) {
    const band = byGroup.get(region.group);
    if (band) {
      band.push(region);
    } else {
      order.push(region.group);
      byGroup.set(region.group, [region]);
    }
  }
  return order.map((group) => {
    const muscles = byGroup.get(group) ?? [];
    const trainedCount = muscles.filter((region) => region.covered).length;
    const covered = trainedCount > 0;
    const ariaLabel = covered
      ? `${group}: ${trainedCount} of ${muscles.length} muscles trained in the ${weeksLabel}`
      : `${group}: not trained in the ${weeksLabel}`;
    return {
      group,
      covered,
      stateLabel: covered ? TRAINED_LABEL : NOT_TRAINED_LABEL,
      trainedCount,
      muscleCount: muscles.length,
      muscles,
      ariaLabel,
    };
  });
}

// Turn the API's per-muscle coverage tier into the muscle-granularity atlas view, preserving the
// server's canonical muscle order (the view never reshuffles it). Pure and server-free, so it is
// safe from either a Server or Client Component.
export function toMuscleRegionAtlas(coverage: RecentCoverage): MuscleRegionAtlasView {
  const weeksLabel = `last ${coverage.weeks} weeks`;
  const { items, unclassified_present, unclassified_volume } = coverage.muscles;
  const maxVolume = items.reduce((max, item) => Math.max(max, item.volume), 0);
  const regions = items.map((item) => toRegion(item, weeksLabel, maxVolume));
  return {
    weeksLabel,
    regions,
    groups: toGroupSections(regions, weeksLabel),
    // The teaching empty state is for a genuinely empty window only — never for one holding work
    // that rolled up off-map. A history of only unmapped work reads as honest not-trained regions
    // plus the footnote (ADR-0025/0073), not "nothing logged".
    isEmpty: regions.every((region) => !region.covered) && !unclassified_present,
    footnote: unclassified_present ? UNCLASSIFIED_FOOTNOTE : null,
    unclassifiedVolume: unclassified_volume,
  };
}
