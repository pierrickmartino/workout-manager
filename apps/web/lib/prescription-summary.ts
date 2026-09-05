// The Prescription Summary projection (CONTEXT: Prescription Summary; ADR-0067, #465) — the pure
// view-model behind a collapsed Exercise Prescription card. Given a Prescription's *advanced*
// fields it renders compact chips for only the values that differ from their default, so a plain
// working set summarizes to nothing at all, and it decides whether a freshly-rendered card opens
// expanded so nothing meaningful is hidden on first view.
//
// It is a **read-time projection**: it stores nothing and touches no record — the same species as
// Tempo's three-state label and the Scheme Preview. At this slice the advanced fields present are
// **Tempo** (rendered as its three-state label, raw code as fallback), **Rest** (`90s rest`), and
// **Set Type** (its label, shown only when the type is not the working default, #466). Later
// slices extend this same seam with Target Effort and the Exercise Note; the chip order here is
// the order they render.
//
// The **Progression Scheme** is deliberately not part of the summary — its Scheme Preview sentence
// stands on its own line whether the card is collapsed or open (CONTEXT: Prescription Summary), so
// a non-default scheme is never hidden and never drives the auto-expand decision. Auto-expand is
// exactly "is there any chip", which keeps the collapsed summary and the open-on-first-view rule
// in lock-step: a card shows chips iff it would have auto-expanded.
//
// No server-only imports, so it is safe in both Server and Client Components and unit-testable
// without a browser.

import { setTypeBadge } from "./set-type-view.ts";
import { toTempoView } from "./tempo-view.ts";

// One compact chip in a collapsed card's Prescription Summary. `key` is a stable React key (also
// the field's identity); `label` is the visible text; `ariaLabel` is the fuller, spoken form so a
// screen-reader user hears the same signal a sighted reader sees.
export interface PrescriptionSummaryChip {
  key: string;
  label: string;
  ariaLabel: string;
}

// The advanced fields a Prescription carries at this slice. Each is optional and nullable: a
// surface may pass `null` or omit the field entirely, and both mean "unset — the default".
export interface PrescriptionAdvancedFields {
  tempo?: string | null;
  restSeconds?: number | null;
  // The stored Set Type (ADR-0065): a curated member (warm-up / working / drop / failure /
  // AMRAP) or null/absent for "unset". An unset — or explicit working — value is the quiet
  // default and summarizes to no chip; only a non-working member earns one.
  setType?: string | null;
}

// Parse a Rest display string — blank for unset, else a seconds count — back to the number the
// Prescription Summary and the auto-expand predicate reason about. A blank or non-numeric string
// is "unset" (null); a `0` is a deliberate no-rest value and survives. Kept here, beside the
// projection that consumes it, so the parse is unit-tested rather than hidden in a component.
export function restSecondsFromInput(restSeconds: string): number | null {
  if (restSeconds.trim() === "") return null;
  const parsed = Number(restSeconds);
  return Number.isFinite(parsed) ? parsed : null;
}

// The Tempo chip, or null when Tempo is unset. A parsed tempo shows its three-state label
// (`Controlled`) with the tempo view's spoken aria label; an unparseable-but-present tempo falls
// back to its raw code so a hand-typed value is still surfaced rather than dropped; a blank tempo
// is the unset default and renders nothing.
function tempoChip(tempo: string | null | undefined): PrescriptionSummaryChip | null {
  const view = toTempoView(tempo);
  if (view.kind === "none") {
    return null;
  }
  if (view.kind === "raw") {
    return { key: "tempo", label: view.raw, ariaLabel: `Tempo ${view.raw}` };
  }
  return { key: "tempo", label: view.label, ariaLabel: view.ariaLabel };
}

// The Rest chip, or null when Rest is unset. Any present, finite value is non-default — including
// a deliberate `0` (a superset-style no-rest) — and reads as `90s rest`.
function restChip(restSeconds: number | null | undefined): PrescriptionSummaryChip | null {
  if (restSeconds == null || !Number.isFinite(restSeconds)) {
    return null;
  }
  return {
    key: "rest",
    label: `${restSeconds}s rest`,
    ariaLabel: `${restSeconds} seconds rest`,
  };
}

// The Set Type chip, or null when the type is the working default. Reuses `set-type-view`'s
// one badge rule — an unset, explicit-working, or unknown value resolves to working and earns
// no chip, while a non-working member (warm-up / drop / failure / AMRAP) reads as its label —
// so the collapsed summary and the plan/record badges name a Set Type exactly one way.
function setTypeChip(setType: string | null | undefined): PrescriptionSummaryChip | null {
  const badge = setTypeBadge(setType);
  if (badge === null) {
    return null;
  }
  return {
    key: "set-type",
    label: badge.label,
    ariaLabel: `Set type ${badge.label}`,
  };
}

// The ordered Prescription Summary chips for a Prescription's advanced fields — one per non-default
// value, in render order (Tempo, Rest, then Set Type). A plain set with all-default fields
// returns `[]`.
export function prescriptionSummaryChips(
  fields: PrescriptionAdvancedFields,
): PrescriptionSummaryChip[] {
  return [
    tempoChip(fields.tempo),
    restChip(fields.restSeconds),
    setTypeChip(fields.setType),
  ].filter((chip): chip is PrescriptionSummaryChip => chip !== null);
}

// Whether a freshly-rendered card should open expanded: true iff any advanced field is non-default
// (i.e. the summary would carry at least one chip). Kept in lock-step with the chips so a card
// auto-expands exactly when it has something meaningful to show, and stays collapsed for a plain
// set. The Progression Scheme is excluded by design — its always-visible preview line means a
// non-default scheme is never hidden.
export function shouldAutoExpand(fields: PrescriptionAdvancedFields): boolean {
  return prescriptionSummaryChips(fields).length > 0;
}
