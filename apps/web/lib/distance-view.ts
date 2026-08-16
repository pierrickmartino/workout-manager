import type { DistanceWeek } from "./analytics-types";

// A weekly distance bar prepared for the Recharts bar chart: the ISO `week` (its
// Monday) kept for the axis and keys, a short human `label` for the tick, and the
// `km` covered that week. The endurance twin of `VolumeChartRow`.
export interface DistanceChartRow {
  week: string;
  label: string;
  km: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format an ISO `yyyy-mm-dd` week-start (a Monday) as a short "Mon D" label. Parsed
// from the string parts so it is timezone-safe — never shifted a day by a Date
// constructor's local offset — and deterministic across environments.
function formatWeekLabel(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Turn the API's weekly distance bars into chart rows, preserving the series'
// ascending order. Pure and server-free, so it is safe from a Client Component.
export function toDistanceBars(weeks: readonly DistanceWeek[]): DistanceChartRow[] {
  return weeks.map((week) => ({
    week: week.week,
    label: formatWeekLabel(week.week),
    km: week.km,
  }));
}

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
