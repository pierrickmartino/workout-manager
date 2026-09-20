// Pure helpers for the press-and-hold Favorite gesture on a My Sessions card (Q6/Q9). Kept
// server-free so the gesture's decision logic is unit-testable without a browser; the React hook
// that wires these to pointer events lives in `components/use-long-press.ts` (a thin, untested
// shell over these, per the repo's lib-tests-only convention).

// How long a pointer must stay down before the press counts as a long-press (favorite toggle),
// and how far it may drift first. A pointer that moves past the tolerance is a scroll/drag, not a
// hold, so the pending long-press is cancelled — the gesture never fights a list scroll.
export const LONG_PRESS_DURATION_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

// Whether a pointer has drifted far enough from its start to disqualify a long-press. Compared per
// axis against the tolerance (a small square), so a mostly-vertical scroll cancels as readily as a
// diagonal drag.
export function exceedsMoveTolerance(
  dx: number,
  dy: number,
  tolerance: number = LONG_PRESS_MOVE_TOLERANCE_PX,
): boolean {
  return Math.abs(dx) > tolerance || Math.abs(dy) > tolerance;
}
