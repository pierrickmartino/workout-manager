import type { WeeklyMuscleComposition } from "./strength-analytics-types.ts";

// One colored segment of a week's stacked bar: the Muscle Group, its exact share as the
// fill `width` (0–100) so the bar stays proportional even as labels round, and a rounded
// whole-percent `label` for the eye and tooltip.
export interface MuscleBalanceSegment {
  group: string;
  width: number;
  label: string;
}

// One week as a stacked-bar row: the ISO `week` Monday, a short `weekLabel` for the axis,
// its `segments` in the server's canonical group order (Unclassified last), an `isEmpty`
// flag for a week with no training, and an `ariaLabel` that names the split — so the bar
// conveys its data to a screen reader and never leans on color alone.
export interface MuscleBalanceWeek {
  week: string;
  weekLabel: string;
  segments: MuscleBalanceSegment[];
  isEmpty: boolean;
  ariaLabel: string;
}

// The Muscle-Group balance-over-time view: the ordered week rows and a section-level
// `isEmpty` that is true only when no week in the window has any training, the honest
// signal for the screen to show an empty state instead of a wall of blank bars.
export interface MuscleBalanceView {
  weeks: MuscleBalanceWeek[];
  isEmpty: boolean;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format an ISO `yyyy-mm-dd` Monday as a short "Mon D" label. Parsed from the string
// parts so it is timezone-safe — never shifted a day by a Date constructor's local
// offset — mirroring `records-view`'s date formatting.
function formatWeekLabel(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Turn the API's per-week composition series into stacked-bar rows, preserving the
// server's week order and canonical group order (the view never reshuffles either).
// Each week's `ariaLabel` enumerates its composition so the bars are screen-reader
// legible without relying on color. Pure and server-free, so it is safe from either a
// Server or Client Component.
export function toMuscleBalance(
  series: readonly WeeklyMuscleComposition[],
): MuscleBalanceView {
  const weeks = series.map(toWeek);
  return {
    weeks,
    isEmpty: weeks.every((week) => week.isEmpty),
  };
}

function toWeek(composition: WeeklyMuscleComposition): MuscleBalanceWeek {
  const segments = composition.groups.map((share) => ({
    group: share.group,
    width: share.pct,
    label: `${Math.round(share.pct)}%`,
  }));
  const weekLabel = formatWeekLabel(composition.week);
  return {
    week: composition.week,
    weekLabel,
    segments,
    isEmpty: segments.length === 0,
    ariaLabel: buildLabel(weekLabel, segments),
  };
}

// The row's accessible name: "Week of Jul 6" plus each group's rounded share, or an
// honest "no training logged" for an untrained week — the data the decorative colored
// bar cannot convey aurally.
function buildLabel(
  weekLabel: string,
  segments: readonly MuscleBalanceSegment[],
): string {
  if (segments.length === 0) {
    return `Week of ${weekLabel}: no training logged`;
  }
  const parts = segments.map((s) => `${s.group} ${s.label}`).join(", ");
  return `Week of ${weekLabel}: ${parts}`;
}
