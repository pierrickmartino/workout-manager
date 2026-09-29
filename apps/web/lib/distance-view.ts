import type { DistanceWeek } from "./analytics-types";
import { formatDayLabel, formatFullWeekLabel } from "./chart-date-label.ts";

// A weekly distance bar prepared for the Recharts bar chart: the ISO `week` (its
// Monday) kept for the axis and keys, a short human `label` for the tick, and the
// `km` covered that week. The endurance twin of `VolumeChartRow`, including its
// `weekText`/`valueText` pair — the week named with its year, and the distance at the
// precision the chart displays (ADR-0084).
export interface DistanceChartRow {
  week: string;
  label: string;
  km: number;
  weekText: string;
  valueText: string;
}

// Turn the API's weekly distance bars into chart rows, preserving the series'
// ascending order. Pure and server-free, so it is safe from a Client Component.
export function toDistanceBars(weeks: readonly DistanceWeek[]): DistanceChartRow[] {
  return weeks.map((week) => ({
    week: week.week,
    label: formatDayLabel(week.week),
    km: week.km,
    weekText: formatFullWeekLabel(week.week),
    // Unrounded, matching the bar and the tooltip: a fractional week ("3.2 km") is the
    // figure the reader logged, and a zero week is the string "0 km" — never a blank cell,
    // because a week the reader trained without covering distance is a fact, not a gap.
    valueText: `${week.km} km`,
  }));
}

// What one row of the Distance values table means. `distance_series` buckets only the weeks
// a distance set actually landed in (`apps/api/app/domain/distance.py`) — it does not fill
// the window — so an absent week logged no distance, while a `0 km` row is a week that
// logged a distance Quantity covering none. Those are different facts and the table must
// not let a reader read one as the other.
export const DISTANCE_VALUES_CAPTION =
  "One row per week that logged distance, named by its Monday. A week with no distance " +
  "logged has no row; a 0 km row logged distance work that covered none.";

// The trend badge: the window's distance against the immediately preceding equal-length
// window, as a signed whole percent ("+18%", "-5%"). Returns `null` when the API sends
// no baseline (`null`), so the caller simply omits the badge rather than showing "0%".
export function formatDistanceDelta(delta: number | null): string | null {
  if (delta === null) {
    return null;
  }
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}
