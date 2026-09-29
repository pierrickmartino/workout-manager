import type { WeeklyMuscleComposition } from "./strength-analytics-types.ts";
import { formatDayLabel, formatFullWeekLabel } from "./chart-date-label.ts";

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
  return {
    week: composition.week,
    // The visible axis label stays short — it is a tick with a neighbour either side.
    weekLabel: formatDayLabel(composition.week),
    segments,
    isEmpty: segments.length === 0,
    // The accessible name is read one row at a time, with no neighbours to supply the
    // context, so it carries the year (CH-F2, ADR-0084). A reader met "Week of Dec 29"
    // followed by "Week of Jan 5" with no way to order them.
    ariaLabel: buildLabel(formatFullWeekLabel(composition.week), segments),
  };
}

// The row's accessible name: "Week of Jul 6, 2026" plus each group's rounded share, or an
// honest "no training logged" for an untrained week — the data the decorative colored
// bar cannot convey aurally.
function buildLabel(
  weekText: string,
  segments: readonly MuscleBalanceSegment[],
): string {
  if (segments.length === 0) {
    return `${weekText}: no training logged`;
  }
  const parts = segments.map((s) => `${s.group} ${s.label}`).join(", ");
  return `${weekText}: ${parts}`;
}
