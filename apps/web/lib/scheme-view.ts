// The plan-view Progression Scheme model (ADR-0064, #432): what the Session/Builder view
// shows for one Exercise Prescription's chosen scheme, and which alternatives it may offer.
//
// A Progression Scheme is a member of a curated, closed catalog — the same species as
// Training Type and Muscle Group — and a Prescription may carry a user-chosen one, defaulting
// to Double Progression when unset. The load-bearing rule mirrored here is **load-kind
// honesty**: the selector only offers schemes compatible with the movement's Load, so a
// user can never pick Greyskull for a pure-bodyweight movement (the write path would reject
// it). This is the web twin of the backend's `compatible_schemes` / `scheme_applies_to_load`.
//
// This module has NO server-only imports, so it is safe from both Server and Client
// Components; the write lives in the server action. Keeping the "current scheme, which
// alternatives, what to display" decision here (not in the page) keeps components thin and
// puts the rules under test.

import { isPureBodyweight, type Load, type LoadKind } from "./load.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

// The closed catalog's stored values (mirror of the backend `ProgressionScheme` enum), in
// catalog order — the sequence the selector renders. Double Progression is the default an
// unset movement resolves to, so it is always first and always offered.
export type ProgressionScheme =
  | "double_progression"
  | "static"
  | "greyskull"
  | "session_count";

// The default every Prescription inherits when it carries no scheme — today's engine, named.
export const DEFAULT_SCHEME: ProgressionScheme = "double_progression";

// One offered scheme: its stored value and the human label the selector shows.
export interface SchemeOption {
  value: ProgressionScheme;
  label: string;
}

// The catalog in render order, each with its display label. The one place a scheme's label
// lives, so the selector and any summary read the same names.
export const SCHEME_OPTIONS: readonly SchemeOption[] = [
  { value: "double_progression", label: "Double Progression" },
  { value: "static", label: "Static / Manual" },
  { value: "greyskull", label: "Greyskull-style Linear" },
  { value: "session_count", label: "Session-Count-Based" },
];

const LABELS: Record<ProgressionScheme, string> = Object.fromEntries(
  SCHEME_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ProgressionScheme, string>;

// The display label for a stored scheme value; the default's label for a null/unknown one,
// so a movement with no choice reads as "Double Progression" rather than blank.
export function schemeLabel(value: string | null | undefined): string {
  if (value != null && value in LABELS) {
    return LABELS[value as ProgressionScheme];
  }
  return LABELS[DEFAULT_SCHEME];
}

// Whether Greyskull applies to a Load — the one bounded scheme. It needs a clean kilogram
// axis: an `absolute` load, or a `bodyweight` load carrying added kilograms. A pure-bodyweight
// (no added kg), `percent_1rm`, `range`, `qualitative`, or absent Load has none. The web
// mirror of the backend `scheme_applies_to_load` for Greyskull; the universal schemes never
// exclude, so this is the only per-scheme cut the client needs.
function greyskullApplies(load: Load | null | undefined): boolean {
  if (load == null) return false;
  if (load.kind === "absolute") return true;
  if (load.kind === "bodyweight") return !isPureBodyweight(load);
  return false;
}

// The schemes a movement with this Load may be assigned — the selector's offered
// alternatives (ADR-0064), in catalog order. The universal schemes (all but Greyskull) always
// apply, so the list is never empty; Greyskull drops out wherever it has no clean weight axis.
export function compatibleSchemes(load: Load | null | undefined): SchemeOption[] {
  return SCHEME_OPTIONS.filter(
    (option) => option.value !== "greyskull" || greyskullApplies(load),
  );
}

// The schemes compatible with a Load expressed as the Builder's raw kind + value input
// (ADR-0064, #432) — the Builder edits Load as an un-typed kind+value pair, not a resolved
// `Load`. Only the distinction Greyskull cares about is reconstructed: an `absolute` load
// always has a kilogram axis; a `bodyweight` load has one only when a positive added value is
// present (a blank/zero value is pure bodyweight). Everything else has none. Reuses
// `compatibleSchemes` so the Builder and the standalone view agree on what is offered.
export function compatibleSchemesForInput(
  loadKind: LoadKind,
  loadValue: string,
): SchemeOption[] {
  const added = Number.parseFloat(loadValue);
  const hasAdded = Number.isFinite(added) && added > 0;
  const load: Load =
    loadKind === "bodyweight"
      ? { kind: "bodyweight", text: loadValue, added_kg: hasAdded ? added : undefined }
      : { kind: loadKind, text: loadValue };
  return compatibleSchemes(load);
}

// The resolved current scheme for a Prescription: its stored value when set (and still a
// known catalog member), else the default. Never blank — an unset or legacy movement reads
// as Double Progression, exactly as the read-time overlay resolves it.
export function currentScheme(
  prescription: Pick<ExercisePrescription, "scheme">,
): ProgressionScheme {
  const value = prescription.scheme;
  if (value != null && value in LABELS) {
    return value as ProgressionScheme;
  }
  return DEFAULT_SCHEME;
}

// The plan-view Scheme control model for one Prescription: the resolved current scheme, the
// compatible alternatives to offer, and whether a non-default choice is active (so the view
// can badge an override and enable a "reset to default" affordance). Computed from the
// movement's Load alone, so the selector can never offer an incompatible scheme.
export interface SchemeControlModel {
  current: ProgressionScheme;
  options: SchemeOption[];
  isOverridden: boolean;
}

export function schemeControlModel(
  prescription: Pick<ExercisePrescription, "scheme" | "recommended_load">,
): SchemeControlModel {
  const current = currentScheme(prescription);
  return {
    current,
    options: compatibleSchemes(prescription.recommended_load),
    isOverridden: current !== DEFAULT_SCHEME,
  };
}
