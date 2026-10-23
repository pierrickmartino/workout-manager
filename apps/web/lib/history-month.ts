// View-model for History's Month view (ADR-0138). No server-only imports, so the Server
// Component page and the Client Component share it.
//
// Month view is a descriptive, read-time filter over the record's dates — not a calendar for
// the plan. It projects the History index (ADR-0128) through the exercise / Training Type
// facets and then through one month (AND). It knows no "today" and has no notion of a missed
// day: a month either holds matching Logged Sessions or it does not.

import {
  DAYS_PER_WEEK,
  dayOfMonth,
  daysInMonth,
  mondayColumnOfFirst,
  shiftMonth,
} from "./month-arithmetic.ts";
import { formatDayMonthYear, formatFullDate, formatMonthYear } from "./date-format.ts";
import { filterHistory, type HistoryFilters } from "./history-filter.ts";
import type { HistoryIndexRow } from "./logs-types";

export interface HistoryMonthView {
  // The month on screen, `YYYY-MM`; null only when the record is empty.
  month: string | null;
  // The selected day, `YYYY-MM-DD`, always inside `month`; null for the whole month.
  day: string | null;
  // The matching Logged Sessions performed in that month — or on the selected day — newest
  // first.
  visible: HistoryIndexRow[];
  // The month's name, "March 2026"; empty when there is no month.
  heading: string;
  // The count line, "7 in March 2026" or "2 on 14 Mar 2026", or the empty state, "No matching
  // sessions in March 2026" / "… on 14 Mar 2026"; empty when there is no month.
  summary: string;
  // The control that clears the selected day, "Show all of March 2026"; null with no day.
  showAll: string | null;
  // The reachable range, first record's month → newest record's month, measured over the whole
  // index so a filter never shrinks it; null only when the record is empty.
  bounds: HistoryMonthBounds | null;
  // The previous / next month arrows: where each goes, or null at a bound (the arrow is
  // disabled), and its accessible name, which names the month it goes to.
  previous: HistoryMonthStep;
  next: HistoryMonthStep;
  // The month's days as Monday-first weeks of seven cells, the Streak and Training Heatmap's
  // week (ADR-0054); a cell outside the month is null. Empty when there is no month.
  weeks: (HistoryMonthDay | null)[][];
}

// One in-month day of the grid.
export interface HistoryMonthDay {
  // The day, `YYYY-MM-DD`.
  date: string;
  // How many Logged Sessions matching the exercise / type filters were performed that day. A
  // day with any carries a neutral presence dot; a day with none looks like any other.
  count: number;
  // The accessible name: the full date and the count, "14 October 2026, 2 sessions".
  label: string;
  // Whether this is the selected day (the button's `aria-pressed`).
  selected: boolean;
  // The day a tap leaves selected: this day, or null when it is already selected (a re-tap
  // clears it).
  toggleTo: string | null;
}

// The months Month view can navigate between, both `YYYY-MM`, `first <= newest`.
export interface HistoryMonthBounds {
  first: string;
  newest: string;
}

// One month arrow: its target `YYYY-MM`, or null when it leads past the record.
export interface HistoryMonthStep {
  month: string | null;
  label: string;
}

const PREVIOUS_LABEL = "Previous month";
const NEXT_LABEL = "Next month";

// The `YYYY-MM` a `YYYY-MM-DD` calendar date falls in. A string slice, never a `Date`: a
// performed date is a calendar value, not an instant (ADR-0096).
function monthOf(performedOn: string): string {
  return performedOn.slice(0, 7);
}

export function projectHistoryMonth(
  index: readonly HistoryIndexRow[],
  filters: HistoryFilters,
): HistoryMonthView {
  const matches = filterHistory(index, filters);
  const bounds = recordBounds(index);
  // A URL month outside the record is ignored, like a malformed one: the view is never
  // rendered out of range, so it falls back to the opening month.
  const month = withinBounds(filters.month, bounds) ?? openingMonth(matches, index);
  if (month === null || bounds === null) {
    return {
      month: null,
      day: null,
      visible: [],
      heading: "",
      summary: "",
      showAll: null,
      bounds: null,
      previous: { month: null, label: PREVIOUS_LABEL },
      next: { month: null, label: NEXT_LABEL },
      weeks: [],
    };
  }
  const monthMatches = matches.filter((row) => monthOf(row.performed_on) === month);
  // A day is only ever selected inside the month on screen; one left behind by a fallback
  // month is dropped.
  const day = filters.day !== null && monthOf(filters.day) === month ? filters.day : null;
  const visible =
    day === null ? monthMatches : monthMatches.filter((row) => row.performed_on === day);
  const heading = formatMonthYear(month);
  return {
    month,
    day,
    visible,
    heading,
    summary:
      day === null
        ? countLine(visible, "in", heading)
        : countLine(visible, "on", formatDayMonthYear(day)),
    showAll: day === null ? null : `Show all of ${heading}`,
    bounds,
    previous: monthStep(PREVIOUS_LABEL, month > bounds.first ? shiftMonth(month, -1) : null),
    next: monthStep(NEXT_LABEL, month < bounds.newest ? shiftMonth(month, 1) : null),
    weeks: monthWeeks(month, monthMatches, day),
  };
}

// Copy names what matched, never what didn't happen: no "missed", no "Calendar".
function countLine(
  visible: readonly HistoryIndexRow[],
  preposition: "in" | "on",
  when: string,
): string {
  return visible.length > 0
    ? `${visible.length} ${preposition} ${when}`
    : `No matching sessions ${preposition} ${when}`;
}

function sessionCount(count: number): string {
  if (count === 0) return "no sessions";
  return count === 1 ? "1 session" : `${count} sessions`;
}

// The month's days laid out in Monday-first weeks, padded with null before the 1st and after
// the last day so every week holds seven cells.
function monthWeeks(
  month: string,
  monthMatches: readonly HistoryIndexRow[],
  selectedDay: string | null,
): (HistoryMonthDay | null)[][] {
  const counts = new Map<string, number>();
  for (const { performed_on } of monthMatches) {
    counts.set(performed_on, (counts.get(performed_on) ?? 0) + 1);
  }
  const lead: null[] = Array.from({ length: mondayColumnOfFirst(month) }, () => null);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = dayOfMonth(month, i + 1);
    const count = counts.get(date) ?? 0;
    const selected = date === selectedDay;
    return {
      date,
      count,
      label: `${formatFullDate(date)}, ${sessionCount(count)}`,
      selected,
      toggleTo: selected ? null : date,
    };
  });
  const cells: (HistoryMonthDay | null)[] = [...lead, ...days];
  const trail = (DAYS_PER_WEEK - (cells.length % DAYS_PER_WEEK)) % DAYS_PER_WEEK;
  const padded = [...cells, ...Array.from({ length: trail }, () => null)];
  return Array.from({ length: padded.length / DAYS_PER_WEEK }, (_, w) =>
    padded.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK),
  );
}

// The filters with Month view's month fixed to the one on screen. A URL without a month opens
// on the newest *matching* month, so without this a filter change would re-resolve and jump
// the view; pinned, a change that empties the month keeps it and shows its empty state. The
// List has no month, so it is returned as is.
export function pinVisibleMonth(
  index: readonly HistoryIndexRow[],
  filters: HistoryFilters,
): HistoryFilters {
  if (filters.view !== "month") return filters;
  const { month, day } = projectHistoryMonth(index, filters);
  return { ...filters, month, day };
}

function withinBounds(
  month: string | null,
  bounds: HistoryMonthBounds | null,
): string | null {
  if (month === null || bounds === null) return null;
  return month >= bounds.first && month <= bounds.newest ? month : null;
}

function monthStep(direction: string, month: string | null): HistoryMonthStep {
  return {
    month,
    label: month === null ? direction : `${direction}, ${formatMonthYear(month)}`,
  };
}

// The first and newest months the whole record holds. Taken as the min / max rather than read
// off the index's ends, so the bounds never depend on the order the rows arrive in. `YYYY-MM`
// strings compare in calendar order.
function recordBounds(index: readonly HistoryIndexRow[]): HistoryMonthBounds | null {
  if (index.length === 0) return null;
  const months = index.map((row) => monthOf(row.performed_on));
  return {
    first: months.reduce((a, b) => (b < a ? b : a)),
    newest: months.reduce((a, b) => (b > a ? b : a)),
  };
}

// The Logged Sessions History shows for these filters, newest first: every facet match in the
// List, the month's matches in Month view. The page picks its first window from this and the
// browser feeds it to the window loader, so both agree on what is on screen (ADR-0128).
export function visibleHistory(
  index: readonly HistoryIndexRow[],
  filters: HistoryFilters,
): HistoryIndexRow[] {
  return filters.view === "month"
    ? projectHistoryMonth(index, filters).visible
    : filterHistory(index, filters);
}

// The month Month view opens on when the URL names none: the newest matching Logged Session's,
// so the view never lands on an empty month after a break. When nothing matches, the newest
// record's month, so the screen still names a month to say "No matching sessions in". Null
// only for an empty record, which History answers with its first-run prompt instead. Taken as
// the max, like `recordBounds`, so it never depends on the order the rows arrive in.
function openingMonth(
  matches: readonly HistoryIndexRow[],
  index: readonly HistoryIndexRow[],
): string | null {
  return newestMonth(matches) ?? newestMonth(index);
}

// The latest `YYYY-MM` among the rows, or null when there are none.
function newestMonth(rows: readonly HistoryIndexRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.map((row) => monthOf(row.performed_on)).reduce((a, b) => (b > a ? b : a));
}
