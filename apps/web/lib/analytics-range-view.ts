import { ANALYTICS_RANGES, type AnalyticsRange } from "./analytics-types.ts";

// The human labels for each Analytics window, shared by the range selector and the
// volume/distance trend captions ("vs. previous 30D") so the two never drift apart.
export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "30d": "30D",
  "90d": "90D",
  "150d": "150D",
};

// The History Depth a window must reach *past* before it reveals anything the
// next-shorter window doesn't (ADR-0056) — the shorter window's span. The floor (30D)
// has no threshold; 90D unlocks past 30 days, 150D past 90. The unlock is strict (a
// depth of exactly 30 days keeps 90D locked), so the hint shows the smallest depth that
// *does* unlock it — one day past the threshold.
const RANGE_UNLOCK_DAYS: Partial<Record<AnalyticsRange, number>> = {
  "90d": 30,
  "150d": 90,
};

// One entry in the range selector: the window, its label, whether it is the served
// (active) window, whether History Depth makes it available, and — when it is locked —
// the hint naming the History Depth that unlocks it (null when available).
export interface RangeOption {
  range: AnalyticsRange;
  label: string;
  active: boolean;
  available: boolean;
  hint: string | null;
}

// Project the served window and the backend's available-ranges set onto the fixed
// selector order. A locked window carries a hint naming the History Depth that unlocks
// it; an available one carries none. `active` marks the served window.
export function toRangeOptions(
  active: AnalyticsRange,
  available: readonly AnalyticsRange[],
): RangeOption[] {
  return ANALYTICS_RANGES.map((range) => {
    const isAvailable = available.includes(range);
    const unlockDays = RANGE_UNLOCK_DAYS[range];
    return {
      range,
      label: RANGE_LABELS[range],
      active: range === active,
      available: isAvailable,
      hint:
        isAvailable || unlockDays === undefined
          ? null
          : `Log ${unlockDays + 1}+ days of history to unlock ${RANGE_LABELS[range]}`,
    };
  });
}
