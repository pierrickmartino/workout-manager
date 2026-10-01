// Which on-screen keyboard a field asks for. `type="number"` is a *validation*
// contract, not a keyboard one: on iOS it still opens the full alphanumeric
// layout, so logging reps mid-set means hunting for digits on a QWERTY. The
// keypad is the `inputmode` hint, and it is derivable — a number field whose
// step admits a fraction wants the decimal pad, one that counts whole things
// wants the numeric pad — so the `Input` primitive derives it once instead of
// 27 call sites each remembering (ADR-0093).
//
// Nothing is derived for the other types. A numeric pad carries no colon,
// hyphen or letters, so forcing one on an `mm:ss` time, a `low-high` Load range
// or a descriptive Load would make those values untypable on a phone. Those
// fields ask for a pad explicitly, at the call site, where the value's grammar
// is known.

export type NumericInputMode = "numeric" | "decimal";

export interface NumericFieldAttributes {
  readonly type?: string;
  readonly step?: string | number;
}

// Whether a step admits a value between two integers. `any` is HTML's "no
// stepping", which is how every Load, distance and body measurement in the app
// spells "decimals allowed". A missing or unparseable step is not evidence of a
// fraction: HTML's own default step for a number field is 1.
export function isFractionalStep(step: string | number | undefined): boolean {
  if (step === undefined) return false;
  if (typeof step === "string" && step.trim().toLowerCase() === "any") return true;
  const value = Number(step);
  return Number.isFinite(value) && !Number.isInteger(value);
}

// The keypad a field's own attributes imply, or `undefined` when the platform
// default is the right answer.
export function numericInputMode(
  attributes: NumericFieldAttributes,
): NumericInputMode | undefined {
  if (attributes.type !== "number") return undefined;
  return isFractionalStep(attributes.step) ? "decimal" : "numeric";
}
