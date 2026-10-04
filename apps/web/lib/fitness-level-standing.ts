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

// One Training Type's standing, ready to render. `label` is the Training Type as authored —
// the row's mono label uppercases it in CSS, as every other Training Type label in the app
// does. `declaredText` / `effectiveText` are both always present: the equal case is a stated
// row, never a blank. `raised` is whether the app is planning above what the user declared,
// which is the only thing the component branches on. `note` is the one sentence that says how
// the two figures relate, and is never empty.
export interface FitnessLevelRow {
  trainingType: string;
  label: string;
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
// read on top of the Declared floor. Everything else reads as "no change" — which is the
// equal case the ticket asks to be stated plainly, and stays true of a reading *below* the
// Declared level too. That reading cannot arrive from the projection (Declared is a floor it
// never breaches), so the view-model declines to invent copy for it rather than asserting
// something false; both figures still render, so the screen never hides a number it was given.
function relationNote(declared: number, effective: number): string {
  const earned = effective - declared;
  if (earned <= 0) {
    return "Matches what you declared — nothing in your recent record moves it.";
  }
  const levels = earned === 1 ? "level" : "levels";
  return `${earned} ${levels} above what you declared, earned from your recent record.`;
}

// Turn the read model's standings into display rows, ordered by the curated Training Type
// order so strength and yoga always read in the same place regardless of how the profile
// happened to be saved. Pure and server-free.
export function toFitnessLevelRows(
  standings: readonly FitnessLevelStanding[],
): FitnessLevelRow[] {
  const curated = CURATED_TYPE_ORDER.filter((type) =>
    standings.some((standing) => standing.training_type === type),
  );
  const seen = new Set(curated);
  const order = [...curated];
  for (const { training_type: type } of standings) {
    if (seen.has(type)) continue;
    seen.add(type);
    order.push(type);
  }

  return order.flatMap((type) => {
    const standing = standings.find((entry) => entry.training_type === type);
    if (standing === undefined) return [];
    return [
      {
        trainingType: standing.training_type,
        label: standing.training_type,
        declaredText: levelText(standing.declared),
        effectiveText: levelText(standing.effective),
        raised: standing.effective > standing.declared,
        note: relationNote(standing.declared, standing.effective),
      },
    ];
  });
}
