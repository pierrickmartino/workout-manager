// The Weight Unit seam. A user's **Weight Unit** is an Interface Preference
// (CONTEXT "Weight Unit") — **kg** or **lb** — steering only how a Load and a
// Performed Body Weight are entered and displayed, never what is stored (storage
// stays canonical kilograms) or generated. This module owns the frontend's closed
// vocabulary for that facet: the type, the canonical catalog, the shipped default,
// and a boundary narrower for the untyped wire value.
//
// Pure and server-free, so it is safe to import from a Server Component and to
// unit-test without a browser (prior art: apps/web/lib/theme.ts's Skin slice).

// A user's chosen Weight Unit (CONTEXT "Weight Unit"). This union is the frontend
// mirror of the backend's closed `WeightUnit` enum in app/domain/appearance.py; the
// two must not drift on which units exist.
export type WeightUnit = "kg" | "lb";

// The catalog as a runtime tuple, so a unit arriving from the API (untyped `string`
// on the wire) can be narrowed to a `WeightUnit` before it is used. Kept in lockstep
// with the `WeightUnit` union above.
export const KNOWN_WEIGHT_UNITS = ["kg", "lb"] as const;

// The shipped default when a user has no Weight Unit preference yet: kilograms, the
// app's canonical storage unit, so existing behaviour is unchanged (CONTEXT "Weight
// Unit"). Mirrors the backend `DEFAULT_WEIGHT_UNIT`.
export const DEFAULT_WEIGHT_UNIT: WeightUnit = "kg";

// Narrow an arbitrary string to a catalog `WeightUnit`. The backend validates the
// stored value against its enum, so the wire value is normally valid; this is a
// defensive boundary check (untrusted external data) so an unexpected value falls
// back to the default rather than driving an off-catalog unit.
export function isWeightUnit(value: string): value is WeightUnit {
  return (KNOWN_WEIGHT_UNITS as readonly string[]).includes(value);
}
