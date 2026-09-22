// Shared, color-independent copy for the Muscle Atlas view-model `muscle-region-atlas-view`
// (ADR-0025/0073/0079). The atlas speaks a neutral, descriptive language ("Trained" / "Not
// trained", the off-map footnote, the trained-in-window aria label), kept in one place so a copy
// tweak lands consistently across the body map, its group roll-up, and their aria-labels rather
// than drifting between them. Pure and server-free, safe from either a Server or Client Component.

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
