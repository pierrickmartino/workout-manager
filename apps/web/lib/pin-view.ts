// The plan-view Pin model (ADR-0053, #371): what the Session/plan view shows for one Exercise
// Prescription's rep target and pin controls. A movement can be in one of three states —
//
//   * `pinned`   — a Pinned Target is set: the plan surfaces the pinned range verbatim (automatic
//                  Progression is suspended for it) and offers an **un-pin** control;
//   * `pinnable` — a pure-bodyweight, un-pinned movement: a **Pin** control is offered, pre-filled
//                  with an editable default range; and
//   * `none`     — a loaded/weighted/free-text movement: reps are not the pinnable axis, no control.
//
// This module has NO server-only imports, so it is safe from both Server and Client Components; the
// pin/un-pin writes live in the server action. Keeping the decision here (not in the page) keeps
// the components thin and puts the "which state, what to pre-fill, what to display" rules under test.

import { isPureBodyweight } from "./load.ts";
import { normalizePinTarget } from "./log-session-form.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

export type PinControlModel =
  | { kind: "pinned"; reps: string }
  | { kind: "pinnable"; defaultReps: string }
  | { kind: "none" };

// Whether a prescription carries a Pinned Target — a non-empty `pinned_reps`. Its presence is the
// "user-set" marker; `null`/absent/blank means the movement is on automatic Progression.
function pinnedReps(prescription: Pick<ExercisePrescription, "pinned_reps">): string | null {
  const value = prescription.pinned_reps;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// The reps to display for a prescription on the plan: the Pinned Target when one is set (what the
// user pinned is what they see, ADR-0053 / user story 20), else the prescribed reps.
export function displayReps(
  prescription: Pick<ExercisePrescription, "reps" | "pinned_reps">,
): string {
  return pinnedReps(prescription) ?? prescription.reps;
}

// Decide the plan-view Pin state for one prescription. A Pinned Target wins (show it + un-pin);
// otherwise a pure-bodyweight movement is `pinnable` with an editable default range seeded from
// its current reps (normalized to the pin shape, blank when the reps are free text like "AMRAP");
// anything else is `none`.
export function pinControlModel(
  prescription: Pick<ExercisePrescription, "reps" | "pinned_reps" | "recommended_load">,
): PinControlModel {
  const pinned = pinnedReps(prescription);
  if (pinned !== null) {
    return { kind: "pinned", reps: pinned };
  }
  if (isPureBodyweight(prescription.recommended_load)) {
    return { kind: "pinnable", defaultReps: normalizePinTarget(prescription.reps) ?? "" };
  }
  return { kind: "none" };
}
