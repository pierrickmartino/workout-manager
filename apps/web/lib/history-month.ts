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
}

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
  const month = filters.month ?? openingMonth(matches, index);
  if (month === null) {
    return { month, visible: [], heading: "", summary: "" };
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
