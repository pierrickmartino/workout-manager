// The plan-side Target Effort model (ADR-0066, #454): what the Session/Builder view shows for
// one Exercise Prescription's prescribed Effort — "aim for RPE 8" / "leave 2 in reserve".
//
// A Target Effort is a typed `{scale, value}` value (the same discipline as Load and the
// record-side logged Effort). It is **descriptive** in v1: it feeds the Scheme Preview and the
// UI but never a Progression input — so this module carries no stepping logic, only the reader
// and the display projection. The cross-scale rendering (RPE⇄RIR) is a **read-time projection**
// delegated to `effort.ts` — the one place that relation lives — so the plan and the record
// project effort the exact same way. An **unset** target renders as **nothing**, so a plan with
// no effort aim stays visually quiet.
//
// No server-only imports, so it is safe from both Server and Client Components; keeping the
// "what target, shown how" decision here (not in the component) keeps components thin and puts
// the projection under test. This is the plan-side twin of the record-side `loggedSetEffort`.

import { formatEffort, type Effort, type EffortScale } from "./effort.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

// Read an editor's Target Effort inputs — a chosen `scale` plus a free-text `value` — into the
// typed Effort the Prescription Summary chip and the payload reason about, or `null` when the
// value is blank (no target) or not a finite number. This is **scale-faithful**: it keeps the
// scale the user picked and never converts across scales, so the chip reads exactly what was
// prescribed. It does **not** band-check the number (an RPE past 10, an RIR past 5) — that is
// validated at the write boundary (a 422, mirroring `hand-authored-session`'s payload build and
// the backend `effort_from_input`), so a mid-edit value still surfaces faithfully rather than
// being dropped. The one place the editor's strings become the typed value, so the parse is
// unit-tested rather than hidden in a component.
export function targetEffortFromInput(
  scale: EffortScale,
  value: string,
): Effort | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? { scale, value: parsed } : null;
}

// The typed Target Effort a Prescription carries for display, or `null` when none is set — the
// one seam the plan view reaches a target through. Normalizes an absent field to `null` so a
// caller never has to distinguish `undefined` from `null`.
export function prescriptionTargetEffort(
  prescription: Pick<ExercisePrescription, "target_effort">,
): Effort | null {
  return prescription.target_effort ?? null;
}

// A rendered Target Effort label, optionally projected into the reader's preferred `scale`
// (default: the scale it was prescribed in), or `null` when no target is set (render nothing).
// Prefixed "Target " so it reads distinctly from a logged effort on the same screen. The value
// routes through `formatEffort`, so the plan target and a logged effort read identically —
// "RPE 8" / "2 RIR" — and project across scales by the same `10 − rir` relation.
export function targetEffortLabel(
  prescription: Pick<ExercisePrescription, "target_effort">,
  scale?: EffortScale,
): string | null {
  const target = prescriptionTargetEffort(prescription);
  if (target == null) {
    return null;
  }
  return `Target ${formatEffort(target, scale)}`;
}
