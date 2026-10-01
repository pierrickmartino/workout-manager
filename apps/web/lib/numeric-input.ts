// Parse a numeric form input to a non-negative integer, treating blanks and garbage as 0.
//
// The Protocol Builder's three numeric entries — a Prescription's `sets` and `restSeconds`, and
// a Superset's round-rest — all write a **number** into the draft for the reducer, so a blank or
// garbled entry has to settle at something rather than put a NaN in the draft and a `null` in
// the deploy payload. 0 is that something: it is what an empty count means, and the field reads
// back as 0 rather than as a field that quietly stopped working.
//
// Its own module because it is a form-input parse and nothing else: the modules that use it are
// about the draft's vocabulary and the rows' markup, and neither should be edited to change how
// a number is read off an input.
export function toIntOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
