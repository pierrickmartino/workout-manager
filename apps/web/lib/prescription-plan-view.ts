// The Session detail card's plan view: one Exercise Prescription read like the Live Session's set
// table (ADR-0114) — a mono summary line (`3 × 8–12 · 60 kg · rest 90s`) and one row per
// prescribed set — so the plan a user reads here is the same shape as the card they will train
// from. Rest follows the Superset rule (ADR-0023): a solo movement shows its own; a grouped one
// rests once per round, so only the group's last member shows the round-rest and the others none.
//
// No server-only imports, so it is safe in both Server and Client Components.

import { formatLoad, NO_LOAD } from "./load.ts";
import type { Quantity } from "./quantity.ts";
import type { ExercisePrescription } from "./sessions-types.ts";
import type { SupersetSlot } from "./supersets.ts";
import type { WeightUnit } from "./weight-unit.ts";

export type PlannedPrescription = Pick<
  ExercisePrescription,
  "sets" | "reps" | "rest_seconds" | "recommended_load" | "prescribed_quantity"
>;

export interface PrescriptionPlanView {
  // The one-line plan under the movement's name.
  summary: string;
  // The amount column's header, named for the Prescribed Quantity's kind (ADR-0050): a run
  // reads "Distance", a timed hold "Duration", a rep count "Reps".
  amountLabel: string;
  // The per-set cells: the amount target (an en-dash range) and the formatted Load.
  reps: string;
  load: string;
  // 1-based set numbers, one per table row.
  setNumbers: number[];
}

const RANGE = /^\s*(\d+)\s*-\s*(\d+)\s*$/;

// "8-12" reads as "8–12"; anything else (a single number, "5+", "45s") as written.
function displayReps(reps: string): string {
  return reps.replace(RANGE, "$1–$2").trim();
}

// A prescription with no typed amount (a legacy read) keeps "Reps", the kind its free-text
// target has always meant.
function amountLabel(quantity: Quantity | null | undefined): string {
  switch (quantity?.kind) {
    case "distance":
      return "Distance";
    case "duration":
      return "Duration";
    default:
      return "Reps";
  }
}

function restPhrase(
  restSeconds: number | null,
  superset: SupersetSlot | undefined,
): string | null {
  if (superset === undefined || superset.group === null) {
    return restSeconds !== null ? `rest ${restSeconds}s` : null;
  }
  return superset.isLastMember && superset.roundRestSeconds !== null
    ? `round rest ${superset.roundRestSeconds}s`
    : null;
}

export function prescriptionPlanView(
  prescription: PlannedPrescription,
  superset: SupersetSlot | undefined,
  unit: WeightUnit,
): PrescriptionPlanView {
  const reps = displayReps(prescription.reps);
  const load = formatLoad(prescription.recommended_load, unit);
  const parts = [
    `${prescription.sets} × ${reps}`,
    load === NO_LOAD ? null : load,
    restPhrase(prescription.rest_seconds, superset),
  ];
  return {
    summary: parts.filter((part) => part !== null).join(" · "),
    amountLabel: amountLabel(prescription.prescribed_quantity),
    reps,
    load,
    setNumbers: Array.from({ length: prescription.sets }, (_, index) => index + 1),
  };
}
