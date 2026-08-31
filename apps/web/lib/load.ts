// The typed Load shared across the plan and the record (ADR-0010). A Load is no
// longer a bare string: its `kind` fixes how it resolves to a number, and `text`
// carries the original, display-ready free text. This module has NO server-only
// imports, so it is safe in both Server and Client Components.

import type { WeightUnit } from "./weight-unit";
import {
  formatWeight,
  formatWeightNumber,
  unitToKg,
  weightUnitLabel,
} from "./weight-format.ts";

export type LoadKind =
  | "absolute"
  | "bodyweight"
  | "percent_1rm"
  | "qualitative"
  | "range";

// The wire shape the API serializes for a typed Load. Only the payload fields the
// `kind` carries are present; `text` is always there and is what the UI displays.
export interface Load {
  kind: LoadKind;
  text: string;
  kg?: number;
  added_kg?: number;
  percent?: number;
  low_kg?: number;
  high_kg?: number;
}

// The em dash the UI shows when no Load was prescribed or logged.
export const NO_LOAD = "—";

// Whether a Load is **pure bodyweight** — the one axis Progression steps by reps (ADR-0026),
// and so the only movement a rep Pin governs (ADR-0053). The web mirror of the backend
// `_is_pure_bodyweight`: the BODYWEIGHT kind carrying no added load. A weighted-bodyweight
// (added-load), loaded, %-1RM, or load-less movement progresses on Load, not reps. `added_kg`
// is omitted on the wire for pure bodyweight, so a nullish check is the "no added load" test.
export function isPureBodyweight(load: Load | null | undefined): boolean {
  return load?.kind === "bodyweight" && load.added_kg == null;
}

// Render a typed Load for display in the reader's Weight Unit, falling back to the em dash
// when absent. The weight-bearing kinds are computed from their numeric **kilogram** fields —
// `absolute` from `kg`, weighted `bodyweight` from `added_kg`, `range` from its bounds — and
// projected to the reader's unit through the `weight-format` seam, so a Redeemed / Shared
// Session renders in the recipient's unit (#417). Pure bodyweight (no added load), `percent_1rm`,
// and `qualitative` carry no kg number and are unit-agnostic, so their preserved `text` stays
// authoritative. A weight-bearing kind missing its number falls back to `text` rather than
// rendering a broken string.
export function formatLoad(
  load: Load | null | undefined,
  unit: WeightUnit,
): string {
  if (load == null) return NO_LOAD;
  switch (load.kind) {
    case "absolute":
      return load.kg != null ? formatWeight(load.kg, unit) : load.text ?? NO_LOAD;
    case "bodyweight":
      return load.added_kg != null
        ? `bodyweight + ${formatWeight(load.added_kg, unit)}`
        : load.text ?? NO_LOAD;
    case "range":
      return load.low_kg != null && load.high_kg != null
        ? `${formatWeightNumber(load.low_kg, unit)}-${formatWeightNumber(load.high_kg, unit)} ${weightUnitLabel(unit)}`
        : load.text ?? NO_LOAD;
    default:
      return load.text ?? NO_LOAD;
  }
}

// Render a Performed Body Weight (ADR-0026) for display in the reader's Weight Unit — the
// captured mass projected from canonical kilograms, or the em dash when none was on file
// (never guessed). Shares the `weight-format` seam so the body-weight stat tracks the same
// unit projection as every other weight (#417).
export function formatBodyWeight(
  kg: number | null | undefined,
  unit: WeightUnit,
): string {
  return kg != null ? formatWeight(kg, unit) : NO_LOAD;
}

// Reverse a typed Load into a picker's `loadKind` + `loadValue` (ADR-0010) — the raw field
// the picker sends for the kind, expressed in the reader's Weight Unit so the input shows what
// they would type: the weight for absolute, the percent for `percent_1rm`, the added weight for
// bodyweight (blank for pure bodyweight), the `low-high` pair for a range, the free text for
// qualitative. The kilogram fields are projected to `unit` through the `weight-format` seam
// (rounded at the display boundary, so a round-trip through the input is drift-free, #417);
// percent and qualitative are unit-agnostic. No Load → a blank absolute field. The single
// source of truth shared by the Log Correction pre-fill and the Capture seed, so the two
// reverse mappings never drift.
export function loadToFields(
  load: Load | null,
  unit: WeightUnit,
): { loadKind: LoadKind; loadValue: string } {
  if (load === null) return { loadKind: "absolute", loadValue: "" };
  switch (load.kind) {
    case "absolute":
      return {
        loadKind: "absolute",
        loadValue: load.kg != null ? formatWeightNumber(load.kg, unit) : "",
      };
    case "percent_1rm":
      return {
        loadKind: "percent_1rm",
        loadValue: load.percent != null ? String(load.percent) : "",
      };
    case "bodyweight":
      return {
        loadKind: "bodyweight",
        loadValue: load.added_kg != null ? formatWeightNumber(load.added_kg, unit) : "",
      };
    case "range":
      return {
        loadKind: "range",
        loadValue:
          load.low_kg != null && load.high_kg != null
            ? `${formatWeightNumber(load.low_kg, unit)}-${formatWeightNumber(load.high_kg, unit)}`
            : "",
      };
    default:
      return { loadKind: "qualitative", loadValue: load.text ?? "" };
  }
}

// The pattern a range value carries — `low-high`, whitespace-tolerant, decimal bounds — so
// each bound can be converted independently. Mirrors the backend range grammar.
const RANGE_VALUE = /^\s*(\d*\.?\d+)\s*-\s*(\d*\.?\d+)\s*$/;

// Convert a picker's `loadValue` — typed in the reader's Weight Unit — into the canonical
// **kilogram** string the backend's `load_from_input` parses (which reads a Load value as kg).
// This is the input half of the unit projection (#417): the weight-bearing kinds (`absolute`,
// `bodyweight` added load, `range` bounds) are converted to exact kilograms with no rounding,
// so what is stored round-trips to the entered value; `percent_1rm` and `qualitative` are
// unit-agnostic and pass through untouched. When the reader's unit is already kilograms the
// value passes through verbatim, so a kg user's submission is byte-for-byte unchanged. A blank
// or unparseable value passes through so the existing backend fallbacks still handle it.
export function loadValueToKg(
  loadKind: string,
  loadValue: string,
  unit: WeightUnit,
): string {
  if (unit === "kg") return loadValue;
  const raw = loadValue.trim();
  if (raw === "") return loadValue;
  switch (loadKind) {
    case "absolute":
    case "bodyweight": {
      const value = Number(raw);
      return Number.isFinite(value) ? String(unitToKg(value, unit)) : loadValue;
    }
    case "range": {
      const pair = RANGE_VALUE.exec(raw);
      if (pair === null) return loadValue;
      return `${unitToKg(Number(pair[1]), unit)}-${unitToKg(Number(pair[2]), unit)}`;
    }
    default:
      return loadValue;
  }
}

// The kinds offered by the log form's picker, paired with a human label. The absolute kind's
// label carries the reader's active Weight Unit — "Weight (kg)" / "Weight (lb)" — replacing the
// old hardcoded "(kg)" so the picker names the unit the field is actually entered in (#417).
export function loadKindOptions(
  unit: WeightUnit,
): ReadonlyArray<{ value: LoadKind; label: string }> {
  return [
    { value: "absolute", label: `Weight (${weightUnitLabel(unit)})` },
    { value: "bodyweight", label: "Bodyweight" },
    { value: "percent_1rm", label: "% of 1RM" },
    { value: "range", label: "Range" },
    { value: "qualitative", label: "Descriptive" },
  ];
}
