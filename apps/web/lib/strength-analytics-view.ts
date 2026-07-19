import { toRecordRows, type RecordRow } from "./records-view.ts";
import type { StrengthAnalyticsOverview } from "./strength-analytics-types.ts";

// One page of the Strength Analytics PR timeline, shaped for the screen: the display
// `rows` (newest-first, reusing the shared record-row formatting), the `isEmpty` gate
// decision that drives the honest empty state, and the `hasPreviousPage`/`hasNextPage`
// flags for the pager. Pure and server-free, so it is safe from either a Server or
// Client Component.
export interface StrengthTimelineView {
  rows: RecordRow[];
  isEmpty: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

// The pagination window the view is being shaped for, from the endpoint's envelope
// `meta`: how many rows a page holds, where this page starts, and the full record
// count across every page.
export interface TimelinePage {
  limit: number;
  offset: number;
  total: number;
}

// Shape one page of the PR timeline. `isEmpty` reflects the gate — a user with no
// qualifying strength history — so it stays the honest "what a strength record needs"
// state even if a hand-edited `?offset=` walks past the end of a real timeline. The
// pager flags come from the page window against the full total.
export function toStrengthTimelineView(
  overview: StrengthAnalyticsOverview,
  page: TimelinePage,
): StrengthTimelineView {
  return {
    rows: toRecordRows(overview.records),
    isEmpty: !overview.has_qualifying_strength,
    hasPreviousPage: page.offset > 0,
    hasNextPage: page.offset + overview.records.length < page.total,
  };
}
