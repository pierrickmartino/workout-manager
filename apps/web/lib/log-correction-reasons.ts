// Tail-first refusal wording for the History correction controls (ADR-0034). Whether a
// Logged Session may be deleted or un-completed is decided server-side (the one contiguity
// gate) and rides on each history record as `deletable` / `uncompletable`; these constants
// are the explanation shown when a control is disabled, so the user learns they must settle
// the later Sessions first rather than being surprised by a `409` (user story 27).

export const DELETE_TAIL_FIRST_REASON =
  "Undo the later sessions in this protocol first — deleting this one would leave a gap " +
  "in your performed sequence.";

export const UNCOMPLETE_TAIL_FIRST_REASON =
  "Undo the later sessions in this protocol first — un-completing this one would leave " +
  "a gap in your performed sequence.";
