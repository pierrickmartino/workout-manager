import type { FitnessLevelStanding } from "./profile-progress-types.ts";

// View-model for the Profile view's Fitness Level section (ADR-0112, #606). It renders one
// row per *declared* Training Type showing the **Declared Fitness Level** the user states
// about themselves against the **Effective Fitness Level** the app actually plans with — the
// difficulty a Protocol is generated at and the size of a Calibration notch both come from the
// Effective one, so when the two disagree the screen says so instead of leaving the user to
// guess which number their plans came from.
//
// Both readings are **drawn**, as one rail of ten notches per row: the notches up to the
// Declared level, then the notches the recent record earned on top of it, then the rest of the
// scale. The section first shipped as a "5/10" and "8/10" pair, which asks the reader to
// subtract two fractions to see the one thing the row is about — the *gap*. A gap is a shape,
// so it is drawn, and the figures stay in the rail's accessible name rather than leaving.
//
// This module has NO server-only imports, so both the Server Component page and any client
// control can use it. The zone mapping, the copy and the ordering live here; the component
// stays a thin renderer of one array.

// The top of the 1–10 Fitness Level scale (GLOSSARY: Fitness Level), and so the number of
// notches every rail is drawn with — equal-length rails are what let two rows be compared.
export const MAX_LEVEL = 10;

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

// What one notch of the rail stands for: a level the user declared, a level the recent record
// earned on top of that declaration, or scale the app is not planning at.
export type FitnessLevelZone = "declared" | "earned" | "empty";

// One Training Type's standing, ready to render. `trainingType` is both the row's key and
// what it names — the Training Type as authored, which the row's mono label uppercases in CSS
// as every other Training Type label in the app does. `zones` is always `MAX_LEVEL` long, so
// every row is drawn against the same scale. `raised` is whether the app is planning above
// what the user declared, which is the only thing the component branches on. `note` is the one
// sentence that says how the two readings relate, and is never empty. `readout` is the rail's
// accessible name: both figures, for a reader who gets no rail at all.
export interface FitnessLevelRow {
  trainingType: string;
  zones: readonly FitnessLevelZone[];
  raised: boolean;
  note: string;
  readout: string;
}

// Which zone each notch of the scale belongs to.
//
// Both readings are clamped into the scale before they are drawn. Neither out-of-range case is
// reachable from the projection — it floors at Declared and caps at the top of the scale — but
// this view-model is handed response data like anything else, and a rail longer or shorter
// than its own scale is a row that cannot be compared with the one above it. A reading *below*
// the declaration draws no earned notch: there is no backwards zone, and inventing one would
// be a drawing that contradicts `relationNote`, which states that case in words.
function zonesOf(declared: number, effective: number): FitnessLevelZone[] {
  const floor = Math.max(0, Math.min(MAX_LEVEL, declared));
  const ceiling = Math.max(floor, Math.min(MAX_LEVEL, effective));
  return Array.from({ length: MAX_LEVEL }, (_, index) => {
    const level = index + 1;
    if (level <= floor) return "declared";
    return level <= ceiling ? "earned" : "empty";
  });
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
// with "no change" would print that sentence beside two different readings, and a false
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

// What a reader gets where a sighted reader gets a drawn position: both readings, unclamped
// and in one breath, which is the comparison the rail draws. It does not repeat the Training
// Type — the row's own heading names that immediately before it, and a screen reader reads
// the two in sequence.
function readout(declared: number, effective: number): string {
  return `Declared level ${declared} of ${MAX_LEVEL}, planning at level ${effective} of ${MAX_LEVEL}.`;
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
      zones: zonesOf(standing.declared, standing.effective),
      raised: standing.effective > standing.declared,
      note: relationNote(standing.declared, standing.effective),
      readout: readout(standing.declared, standing.effective),
    }));
}
