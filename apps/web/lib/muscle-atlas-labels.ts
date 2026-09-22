// Shared, color-independent copy for the Muscle Atlas surfaces — the six-group
// `muscle-atlas-view` and its per-muscle successor `muscle-region-atlas-view` (ADR-0025/0073).
// Both tiers speak the same neutral, descriptive language ("Trained" / "Not trained", the
// off-map footnote, the trained-in-window aria label), so it lives in one place: a copy tweak
// then lands on both atlases at once rather than silently drifting between them. Pure and
// server-free, safe from either a Server or Client Component.

export const TRAINED_LABEL = "Trained";
export const NOT_TRAINED_LABEL = "Not trained";

// The neutral, non-prescriptive disclosure copy (ADR-0025): it names that some recent work
// rolls up outside the mapped groups/muscles without ranking, flagging, or nudging.
export const UNCLASSIFIED_FOOTNOTE = "Some recent sets list muscles we don't map yet.";

export function setsWord(sets: number): string {
  return sets === 1 ? "set" : "sets";
}

// The composed screen-reader label for one atlas subject (a Muscle Group or an individual
// Muscle): it carries state *and* volume so a screen reader never needs the region's color or
// fill — "Legs: trained in the last 8 weeks, 22 sets" / "Core: not trained in the last 8 weeks".
export function coverageAriaLabel(
  subject: string,
  weeksLabel: string,
  covered: boolean,
  sets: number,
): string {
  return covered
    ? `${subject}: trained in the ${weeksLabel}, ${sets} ${setsWord(sets)}`
    : `${subject}: not trained in the ${weeksLabel}`;
}
