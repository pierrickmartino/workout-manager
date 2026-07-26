// The typed Quantity — a Logged Set's amount axis (ADR-0032), the sibling of the
// typed Load. A set's amount is no longer a bare `reps` number: its `kind` fixes what
// the amount means (a rep count, a distance, a duration) and `text` carries the
// original, display-ready value. This module has NO server-only imports, so it is safe
// in both Server and Client Components.

export type QuantityKind = "repetitions" | "distance" | "duration";

// The distance kind's display unit — kilometres or miles. The value is entered in
// either and canonicalised to metres at the write boundary (ADR-0032); the unit label
// rides through only so the display text reads as the user typed it.
export type DistanceUnit = "km" | "mi";

const METRES_PER_MILE = 1609.344;
const METRES_PER_KM = 1000;
const SECONDS_PER_MINUTE = 60;
const DISTANCE_KIND: QuantityKind = "distance";
const DURATION_KIND: QuantityKind = "duration";

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

// The per-set request fields for a distance Quantity: the picked kind, the entered
// value and its unit (km or miles, canonicalised to metres by the backend), and the
// optional companion time from which pace becomes derivable. A blank time is sent as
// null, not an empty string, so pace stays underivable for a distance-only set.
export function distanceInput(
  value: string,
  unit: DistanceUnit,
  duration: string,
): {
  quantity_kind: QuantityKind;
  quantity_value: string;
  quantity_unit: DistanceUnit;
  quantity_duration: string | null;
} {
  const time = duration.trim();
  return {
    quantity_kind: DISTANCE_KIND,
    quantity_value: value,
    quantity_unit: unit,
    quantity_duration: time === "" ? null : time,
  };
}

// The per-set request fields for a duration Quantity — timed, non-locomotion work (a
// hold, a distance-unknown treadmill session). The picked kind and the entered time
// ride through verbatim; the backend canonicalises to seconds. No unit or companion
// time: a duration carries no distance, so pace is not derivable (CONTEXT 'Quantity').
export function durationInput(value: string): {
  quantity_kind: QuantityKind;
  quantity_value: string;
} {
  return { quantity_kind: DURATION_KIND, quantity_value: value };
}

// The whole seconds of a canonical seconds figure, formatted as `m:ss` (the display
// form pace and split times share). A partial second rounds to the nearest second.
function formatMinutesSeconds(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / SECONDS_PER_MINUTE);
  const seconds = rounded % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Project pace from a timed distance Quantity — a read-time derivation over the two
// measured numbers (metres and duration_s), never a stored figure (ADR-0032). Returns
// null unless the amount is a `distance` carrying a positive metres *and* a companion
// time; the pace unit follows the entered unit so it reads as the run was logged.
export function formatPace(quantity: Quantity | null | undefined): string | null {
  if (!quantity || quantity.kind !== DISTANCE_KIND) return null;

  const { metres, duration_s } = quantity;
  if (metres == null || metres <= 0 || duration_s == null) return null;

  const inMiles = (quantity.text ?? "").trimEnd().endsWith("mi");
  const metresPerUnit = inMiles ? METRES_PER_MILE : METRES_PER_KM;
  const unitLabel = inMiles ? "mi" : "km";

  const secondsPerUnit = duration_s / (metres / metresPerUnit);
  return `${formatMinutesSeconds(secondsPerUnit)} /${unitLabel}`;
}
