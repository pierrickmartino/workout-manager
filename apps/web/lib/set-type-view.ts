// The Set Type badge model (ADR-0065, #449): what the plan and record views show for one
// set's Set Type — a descriptive, curated label (warm-up / working / drop / failure / AMRAP).
//
// A Set Type is a member of a curated, closed catalog — the same species as Progression
// Scheme and Training Type. It is **descriptive only**: it feeds no progression and no
// analytics (yet), so this module carries no compatibility or stepping logic, only the label
// and the one rendering rule that matters — an **unset** Set Type resolves to *working* and
// renders as **no badge**, so a plain set stays visually quiet. The web twin of the backend
// `app.domain.set_type`.
//
// No server-only imports, so it is safe from both Server and Client Components; keeping the
// "which badge, if any" decision here (not in the component) keeps components thin and puts
// the rule under test.

import type { ExercisePrescription } from "./sessions-types.ts";
import type { LoggedSet } from "./logs-types.ts";

// The closed catalog's stored values (mirror of the backend `SetType` enum), in catalog
// order. `working` is the default an unset annotation resolves to — the quiet, un-badged case.
export type SetType = "warm_up" | "working" | "drop" | "failure" | "amrap";

// The Set Type an unset (null/absent) annotation resolves to — a working set, rendered with
// no badge so a plain set carries no visual noise.
export const DEFAULT_SET_TYPE: SetType = "working";

// The human label for each member — the one place a Set Type's display name lives, so every
// badge and summary reads the same names. `AMRAP` keeps its acronym; the rest are Title Case.
const LABELS: Record<SetType, string> = {
  warm_up: "Warm-up",
  working: "Working",
  drop: "Drop set",
  failure: "To failure",
  amrap: "AMRAP",
};

// Whether a stored value names a known catalog member — the boundary the view resolves
// against, so a legacy or foreign value reads as unset rather than a fabricated label.
function isKnown(value: string | null | undefined): value is SetType {
  return value != null && value in LABELS;
}

// The resolved effective Set Type for a stored value: the member when set (and still known),
// else the default (`working`). Never throws — mirrors the backend `resolve_set_type`.
export function resolveSetType(value: string | null | undefined): SetType {
  return isKnown(value) ? value : DEFAULT_SET_TYPE;
}

// One rendered Set Type badge: the resolved member and its label. The view-model returns
// `null` for an unset (or working) Set Type, which is the signal to render *no* badge.
export interface SetTypeBadge {
  value: SetType;
  label: string;
}

// The badge to show for a stored Set Type value, or `null` when none should show. An unset
// value — and an explicit `working` — both resolve to no badge, so a plain set stays quiet;
// only a non-default member (warm-up / drop / failure / AMRAP) earns a badge. This is the
// single rule the plan and record views share.
export function setTypeBadge(value: string | null | undefined): SetTypeBadge | null {
  const resolved = resolveSetType(value);
  if (resolved === DEFAULT_SET_TYPE) {
    return null;
  }
  return { value: resolved, label: LABELS[resolved] };
}

// The badge for one Exercise Prescription's plan-side Set Type — the plan view's affordance.
export function prescriptionSetTypeBadge(
  prescription: Pick<ExercisePrescription, "set_type">,
): SetTypeBadge | null {
  return setTypeBadge(prescription.set_type);
}

// The badge for one Logged Set's record-side Set Type — the record/history view's affordance.
export function loggedSetTypeBadge(
  loggedSet: Pick<LoggedSet, "set_type">,
): SetTypeBadge | null {
  return setTypeBadge(loggedSet.set_type);
}
