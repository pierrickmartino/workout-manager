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

// Render a typed Load for display, falling back to the em dash when absent. The
// stored `text` is authoritative — it preserves exactly what was prescribed or
// logged ("70kg", "bodyweight", "70% 1RM"), so the UI never re-derives it.
export function formatLoad(load: Load | null | undefined): string {
  return load?.text ?? NO_LOAD;
}

// The kinds offered by the log form's picker, paired with a human label.
export const LOAD_KIND_OPTIONS: ReadonlyArray<{ value: LoadKind; label: string }> = [
  { value: "absolute", label: "Weight (kg)" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "percent_1rm", label: "% of 1RM" },
  { value: "range", label: "Range" },
  { value: "qualitative", label: "Descriptive" },
];
