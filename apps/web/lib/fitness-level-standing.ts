import type { FitnessLevelStanding } from "./profile-progress-types.ts";

// View-model for the Profile view's Fitness Level section (ADR-0112, #606). It renders one
// row per *declared* Training Type showing the **Declared Fitness Level** the user states
// about themselves against the **Effective Fitness Level** the app actually plans with — the
// difficulty a Protocol is generated at and the size of a Calibration notch both come from the
// Effective one, so when the two disagree the screen says so instead of leaving the user to
// guess which number their plans came from.
//
// This module has NO server-only imports, so both the Server Component page and any client
// control can use it. The copy and the ordering live here; the component stays a thin renderer.

// The top of the 1–10 Fitness Level scale (CONTEXT: Fitness Level), shown as the denominator so
// a level reads as a position on a scale rather than a bare number.
const MAX_LEVEL = 10;

// The curated Training Type order the rows render in — mirroring `TRAINING_TYPES` in
// `profile-types.ts` (the fixed five). Kept local rather than value-imported so this pure,
// browser-safe view-model stays free of runtime sibling imports (the repo's convention for
// unit-tested view-models), exactly as `session-library.ts` does. Drift is graceful: a type
// outside this list is still shown, appended after the curated ones.
const CURATED_TYPE_ORDER: readonly string[] = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
];

// One Training Type's standing, ready to render. `trainingType` is both the row's key and
// what it names — the Training Type as authored, which the row's mono label uppercases in CSS
// as every other Training Type label in the app does. `declaredText` / `effectiveText` are
// both always present: the equal case is a stated row, never a blank. `raised` is whether the
// app is planning above what the user declared, which is the only thing the component branches
// on. `note` is the one sentence that says how the two figures relate, and is never empty.
export interface FitnessLevelRow {
  trainingType: string;
  declaredText: string;
  effectiveText: string;
  raised: boolean;
  note: string;
}

function levelText(level: number): string {
  return `${level}/${MAX_LEVEL}`;
}

// How the two readings relate, in one sentence.
//
// A positive difference is earned evidence: net comfortable Sessions in the recent window,
// read on top of the Declared floor. Equal is the common case, and the one the ticket asks to
// be stated plainly rather than left blank.
//
// The third branch is for a reading *below* the Declared level, which the projection cannot
// produce — Declared is a floor it never breaches — but which this view-model is handed as
// untrusted response data like anything else. It is captioned in the same shape as the raised
// case and says nothing about a cause, because the alternative is not silence: folding it in
// with "no change" would print that sentence beside two different numbers, and a false
// sentence is worse than a plain one for a state that should never arrive.
function relationNote(declared: number, effective: number): string {
  const earned = effective - declared;
  if (earned === 0) {
    return "Matches what you declared — nothing in your recent record moves it.";
  }
  const magnitude = Math.abs(earned);
  const levels = magnitude === 1 ? "level" : "levels";
  return earned > 0
    ? `${magnitude} ${levels} above what you declared, earned from your recent record.`
    : `${magnitude} ${levels} below what you declared.`;
}

// Where a Training Type sorts. A type the curated list does not name sorts after every one it
// does; the sort is stable, so those keep the order they were served in. Drift is graceful: a
// declared level is never silently dropped from the screen that explains the app's reading.
function curatedIndex(trainingType: string): number {
  const position = CURATED_TYPE_ORDER.indexOf(trainingType);
  return position === -1 ? CURATED_TYPE_ORDER.length : position;
}

// Turn the read model's standings into display rows, ordered by the curated Training Type
// order so strength and yoga always read in the same place regardless of how the profile
// happened to be saved. Pure and server-free; the input is copied before sorting, never
// mutated.
export function toFitnessLevelRows(
  standings: readonly FitnessLevelStanding[],
): FitnessLevelRow[] {
  return [...standings]
    .sort(
      (left, right) =>
        curatedIndex(left.training_type) - curatedIndex(right.training_type),
    )
    .map((standing) => ({
      trainingType: standing.training_type,
      declaredText: levelText(standing.declared),
      effectiveText: levelText(standing.effective),
      raised: standing.effective > standing.declared,
      note: relationNote(standing.declared, standing.effective),
    }));
}
