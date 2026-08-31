// The Weight Unit conversion + formatting seam (issue #417). Storage stays canonical
// kilograms; a reader's chosen Weight Unit (CONTEXT "Weight Unit") is a **read-time
// projection computed per reader** — so a Redeemed / Shared Session shows the
// recipient's unit, not the author's. Weight *inputs* run the inverse: a figure typed
// in the reader's unit converts to **exact kilograms** on the way in, with rounding
// applied only here at the display boundary so a round-trip never drifts.
//
// Pure and server-free (no I/O, no server-only imports), so it is safe to import from
// both Server and Client Components and is unit-testable without a browser. This is the
// one place kilograms turn into pounds and back — every weight surface routes through
// it rather than inlining a factor or a "kg" literal. **Distance is untouched** (it has
// its own km/mi unit in lib/quantity.ts); this module governs weight only.

import type { WeightUnit } from "./weight-unit";

// 1 international pound = 0.45359237 kilograms, exactly. The exact factor so a pound
// entry becomes canonical kilograms losslessly — no rounding is baked into storage;
// it happens only when a figure is rendered.
export const KG_PER_LB = 0.45359237;

// The display digits a projected pound figure is rounded to at the boundary: at most two
// decimals. Keeps a lb entry's typical granularity (whole and half pounds) stable across a
// round-trip while clearing the floating-point noise the kg→lb conversion introduces.
// Rounding lives ONLY here — stored kilograms stay exact, and the kg display path never
// rounds, so it is byte-for-byte identical to what the app has always shown (#415).
const DISPLAY_DECIMALS = 2;

// The unit's short display label — the catalog values ("kg" / "lb") are already the
// labels shown beside a figure and on an input's unit affordance.
export function weightUnitLabel(unit: WeightUnit): string {
  return unit;
}

// Project a canonical kilogram figure into the reader's unit as a raw, unrounded
// number. Kilograms pass straight through; pounds divide by the exact factor. The
// caller rounds at the display boundary (`formatWeight*`); the raw number is what a
// chart plots so bar heights stay proportional.
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

// Convert a figure the user entered in their unit back to canonical, exact kilograms —
// the inverse of `kgToUnit`, with no rounding, so what is stored round-trips to the
// same displayed value. Kilograms pass straight through.
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

// Round a projected pound figure to at most `DISPLAY_DECIMALS` decimals, dropping trailing
// zeros (`132.277…` → "132.28", `155.0` → "155"). The multiply/round then `String` guards
// against a floating-point artefact at the last place. The single rounding point in the
// module — reached only for pounds.
function roundForDisplay(value: number): string {
  const rounded = Math.round(value * 10 ** DISPLAY_DECIMALS) / 10 ** DISPLAY_DECIMALS;
  return String(rounded);
}

// A weight figure's display digits in the reader's unit, without the unit label — for a
// range's bounds ("10-20"), an input pre-fill, or anywhere the label is placed separately.
// Kilograms render exactly (`String`), byte-for-byte as the app has always shown them (#415);
// pounds project through the exact factor and round at the display boundary.
export function formatWeightNumber(kg: number, unit: WeightUnit): string {
  return unit === "lb" ? roundForDisplay(kgToUnit(kg, "lb")) : String(kg);
}

// A weight figure with its unit label — "70 kg" / "155 lb". The canonical numeric→string
// weight seam every Load and Performed Body Weight display routes through.
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${formatWeightNumber(kg, unit)} ${weightUnitLabel(unit)}`;
}

// Project a kilogram figure (or a kilogram delta — the conversion is linear) into the
// reader's unit and round to a whole number: the Estimated 1RM / Personal Record
// headline precision, a shared magnitude comparable across lifts.
export function wholeWeightInUnit(kg: number, unit: WeightUnit): number {
  return Math.round(kgToUnit(kg, unit));
}

// A whole-number weight figure with its unit label — "142 kg" / "313 lb". The headline
// form for an Estimated 1RM and a Personal Record.
export function formatWholeWeight(kg: number, unit: WeightUnit): string {
  return `${wholeWeightInUnit(kg, unit)} ${weightUnitLabel(unit)}`;
}
