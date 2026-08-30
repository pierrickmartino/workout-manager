// The typed Load shared across the plan and the record (ADR-0010). A Load is no
// longer a bare string: its `kind` fixes how it resolves to a number, and `text`
// carries the original, display-ready free text. This module has NO server-only
// imports, so it is safe in both Server and Client Components.

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

// The weight unit label. Isolated as one token so the pound projection (#416) has a single
// place to swap it; every kg display below routes through it rather than inlining "kg".
const KG_UNIT = "kg";

// Render a raw kilogram number to its display digits: a whole number drops its trailing
// ".0" (JS `70.0` prints "70"), a fraction keeps its decimals (72.5 → "72.5"). Mirrors the
// backend `_format_number`. Kept separate from the unit label so the pound projection (#416)
// can convert the number before the unit is chosen.
function formatWeightNumber(value: number): string {
  return String(value);
}

// A kilogram figure with its unit — the canonical "70 kg" / "72.5 kg" the app has always
// shown. This is the one numeric→string weight seam: every weight display computes through
// here from a number instead of echoing stored text, so the pound projection (#416) has a
// single place to swap the unit.
export function formatKg(value: number): string {
  return `${formatWeightNumber(value)} ${KG_UNIT}`;
}

// Render a typed Load for display, falling back to the em dash when absent. The weight-bearing
// kinds are computed from their numeric kilogram fields — `absolute` from `kg`, weighted
// `bodyweight` from `added_kg`, `range` from its bounds — so the shown string is derived from
// numbers, not the stored `text`; that is the seam the pound projection (#416) needs. Pure
// bodyweight (no added load), `percent_1rm`, and `qualitative` carry no kg number, so their
// preserved `text` stays authoritative. A weight-bearing kind missing its number falls back to
// `text` rather than rendering a broken string.
export function formatLoad(load: Load | null | undefined): string {
  if (load == null) return NO_LOAD;
  switch (load.kind) {
    case "absolute":
      return load.kg != null ? formatKg(load.kg) : load.text ?? NO_LOAD;
    case "bodyweight":
      return load.added_kg != null
        ? `bodyweight + ${formatKg(load.added_kg)}`
        : load.text ?? NO_LOAD;
    case "range":
      return load.low_kg != null && load.high_kg != null
        ? `${formatWeightNumber(load.low_kg)}-${formatWeightNumber(load.high_kg)} ${KG_UNIT}`
        : load.text ?? NO_LOAD;
    default:
      return load.text ?? NO_LOAD;
  }
}

// Render a Performed Body Weight (ADR-0026) for display — the captured mass as a kilogram
// figure, or the em dash when none was on file (never guessed). Shares the `formatKg` seam so
// the body-weight stat tracks the same unit projection as every other weight (#416).
export function formatBodyWeight(kg: number | null | undefined): string {
  return kg != null ? formatKg(kg) : NO_LOAD;
}

// Reverse a typed Load into a picker's `loadKind` + `loadValue` (ADR-0010) — the raw field
// the picker sends for the kind: kilograms for absolute, the percent for `percent_1rm`, the
// added kilograms for bodyweight (blank for pure bodyweight), the `low-high` pair for a
// range, the free text for qualitative. No Load → a blank absolute field. The single source
// of truth shared by the Log Correction pre-fill and the Capture seed, so the two reverse
// mappings never drift.
export function loadToFields(
  load: Load | null,
): { loadKind: LoadKind; loadValue: string } {
  if (load === null) return { loadKind: "absolute", loadValue: "" };
  switch (load.kind) {
    case "absolute":
      return { loadKind: "absolute", loadValue: load.kg != null ? String(load.kg) : "" };
    case "percent_1rm":
      return {
        loadKind: "percent_1rm",
        loadValue: load.percent != null ? String(load.percent) : "",
      };
    case "bodyweight":
      return {
        loadKind: "bodyweight",
        loadValue: load.added_kg != null ? String(load.added_kg) : "",
      };
    case "range":
      return {
        loadKind: "range",
        loadValue:
          load.low_kg != null && load.high_kg != null
            ? `${load.low_kg}-${load.high_kg}`
            : "",
      };
    default:
      return { loadKind: "qualitative", loadValue: load.text ?? "" };
  }
}

// The kinds offered by the log form's picker, paired with a human label.
export const LOAD_KIND_OPTIONS: ReadonlyArray<{ value: LoadKind; label: string }> = [
  { value: "absolute", label: "Weight (kg)" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "percent_1rm", label: "% of 1RM" },
  { value: "range", label: "Range" },
  { value: "qualitative", label: "Descriptive" },
];
