// The typed Quantity — a Logged Set's amount axis (ADR-0032), the sibling of the
// typed Load. A set's amount is no longer a bare `reps` number: its `kind` fixes what
// the amount means (a rep count, a distance, a duration) and `text` carries the
// original, display-ready value. This module has NO server-only imports, so it is safe
// in both Server and Client Components.

export type QuantityKind = "repetitions" | "distance" | "duration";

// The wire shape the API serializes for a typed Quantity. Only the payload fields the
// `kind` carries are present; `text` is always there and is what the UI displays.
export interface Quantity {
  kind: QuantityKind;
  text: string;
  count?: number;
  metres?: number;
  duration_s?: number;
  seconds?: number;
}

// The em dash the UI shows when a set carries no readable amount.
export const NO_QUANTITY = "—";

// The kind the log form has always sent — a rep count — kept authoritative at the
// write boundary so the persisted set fixes its meaning instead of re-guessing it.
export const REPETITIONS_KIND: QuantityKind = "repetitions";

// Render a typed Quantity for display, falling back to the em dash when absent. The
// stored `text` is authoritative — it preserves exactly what was logged ("5", "5 km",
// "5:00") — so the UI never re-derives it.
export function formatQuantity(quantity: Quantity | null | undefined): string {
  return quantity?.text ?? NO_QUANTITY;
}

// The rep count carried by a Quantity, or null for a non-rep amount (a run, a hold).
// The client-side sibling of the backend `repetitions` accessor, so a surface that
// wants the number rather than the display text reaches it at one call site.
export function quantityReps(quantity: Quantity | null | undefined): number | null {
  return quantity && quantity.kind === "repetitions" ? quantity.count ?? null : null;
}

// The per-set request fields for a repetitions Quantity, built from the reps the log
// form collected. Mirrors how the load picker sends `load_kind` + `load_value`: the
// backend types the amount from the picked kind, never re-guessing the raw value.
export function repetitionsInput(reps: number): {
  quantity_kind: QuantityKind;
  quantity_value: string;
} {
  return { quantity_kind: REPETITIONS_KIND, quantity_value: String(reps) };
}
