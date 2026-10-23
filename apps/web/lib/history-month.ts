// View-model for History's Month view (ADR-0138). No server-only imports, so the Server
// Component page and the Client Component share it.
//
// Month view is a descriptive, read-time filter over the record's dates — not a calendar for
// the plan. It projects the History index (ADR-0128) through the exercise / Training Type
// facets and then through one month (AND). It knows no "today" and has no notion of a missed
// day: a month either holds matching Logged Sessions or it does not.

import { formatMonthYear } from "./date-format.ts";
import { filterHistory, type HistoryFilters } from "./history-filter.ts";
import type { HistoryIndexRow } from "./logs-types";

export interface HistoryMonthView {
  // The month on screen, `YYYY-MM`; null only when the record is empty.
  month: string | null;
  // The matching Logged Sessions performed in that month, newest first.
  visible: HistoryIndexRow[];
  // The month's name, "March 2026"; empty when there is no month.
  heading: string;
  // The count line, "7 in March 2026", or the empty state, "No matching sessions in March
  // 2026"; empty when there is no month.
  summary: string;
  // The reachable range, first record's month → newest record's month, measured over the whole
  // index so a filter never shrinks it; null only when the record is empty.
  bounds: HistoryMonthBounds | null;
  // The previous / next month arrows: where each goes, or null at a bound (the arrow is
  // disabled), and its accessible name, which names the month it goes to.
  previous: HistoryMonthStep;
  next: HistoryMonthStep;
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
      visible: [],
      heading: "",
      summary: "",
      bounds: null,
      previous: { month: null, label: PREVIOUS_LABEL },
      next: { month: null, label: NEXT_LABEL },
    };
  }
  const visible = matches.filter((row) => monthOf(row.performed_on) === month);
  const heading = formatMonthYear(month);
  return {
    month,
    visible,
    heading,
    // Copy names what matched, never what didn't happen: no "missed", no "Calendar".
    summary:
      visible.length > 0
        ? `${visible.length} in ${heading}`
        : `No matching sessions in ${heading}`,
    bounds,
    previous: monthStep(PREVIOUS_LABEL, month > bounds.first ? shiftMonth(month, -1) : null),
    next: monthStep(NEXT_LABEL, month < bounds.newest ? shiftMonth(month, 1) : null),
  };
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
  return { ...filters, month: projectHistoryMonth(index, filters).month };
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

// The `YYYY-MM` `delta` months from `month`, by arithmetic on the parts — never a `Date`, so
// no time zone can move it (ADR-0096).
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const total = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
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
// only for an empty record, which History answers with its first-run prompt instead.
function openingMonth(
  matches: readonly HistoryIndexRow[],
  index: readonly HistoryIndexRow[],
): string | null {
  const newest = matches[0] ?? index[0];
  return newest === undefined ? null : monthOf(newest.performed_on);
}
