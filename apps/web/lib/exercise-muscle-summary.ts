// Pure view-model that bounds an Exercise's flat targeted-muscle list for the compact
// catalog rows — the Exercise Library picker and the Browse catalog. A many-muscle
// movement (e.g. Running's seven) would otherwise render one long non-wrapping line that
// pushes the row past a mobile viewport. This shows the first few muscles in their stored
// order and discloses the rest as a "+K" remainder; the full list stays on Exercise
// Detail. No server or React imports, so it is unit-testable with `node --test`.

// How many muscles the compact row spells out before collapsing the rest into "+K". Kept
// small so the line fits a phone; the CSS `truncate` on the row is the structural backstop
// if even these are unusually long.
export const MUSCLE_SUMMARY_LIMIT = 3;

export interface MuscleSummary {
  // The muscles to spell out, capped at the limit, in their original stored order.
  shown: string[];
  // How many targeted muscles are not shown (0 when the whole list fits).
  moreCount: number;
}

// Split a targeted-muscle list into the first `limit` shown muscles and a count of the
// remainder. The stored order is preserved deliberately — the flat list is not guaranteed
// primary-first, so "first N" is by list order, not importance. Returns a fresh array; the
// caller's list is never mutated.
export function summarizeTargetedMuscles(
  muscles: readonly string[],
  limit: number = MUSCLE_SUMMARY_LIMIT,
): MuscleSummary {
  const shown = muscles.slice(0, limit);
  return { shown, moreCount: muscles.length - shown.length };
}

// The single display line both rows render: the shown muscles joined by a middot, with a
// trailing "+K" when muscles are hidden. Natural case — the row's `label-mono` CSS applies
// the uppercase micro-label style. Empty string when there are no muscles, so the caller
// can decide whether to render the line at all.
export function formatMuscleSummary(
  muscles: readonly string[],
  limit: number = MUSCLE_SUMMARY_LIMIT,
): string {
  const { shown, moreCount } = summarizeTargetedMuscles(muscles, limit);
  if (shown.length === 0) return "";
  const joined = shown.join(" · ");
  return moreCount > 0 ? `${joined} +${moreCount}` : joined;
}
