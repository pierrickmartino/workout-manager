import { toRecordRows, type RecordRow } from "./records-view.ts";
import type { StrengthAnalyticsOverview } from "./strength-analytics-types.ts";
import type { WeightUnit } from "./weight-unit";

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

// The teaching empty state shown when the gate is closed — a user with no qualifying
// strength history. It names *both* honest paths to a strength record (ADR-0024/0026):
// an absolute-load set, or a bodyweight set once a Performed Body Weight is on file, each
// in the trustworthy 1–12-rep window. Kept here beside the `isEmpty` gate decision so the
// copy and the condition that surfaces it stay together, and so it is unit-testable in a
// repo whose frontend tests run over `lib/*.ts` (no component render harness).
export const STRENGTH_EMPTY_STATE_COPY =
  "No strength records yet. A strength record comes from a set in the 1–12 rep " +
  "range — logged with a weight in kilograms, or a bodyweight set once you've " +
  "recorded your body weight — enough to estimate a one-rep max. Log a few working " +
  "sets and your Personal Record timeline will build here.";

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
  unit: WeightUnit,
): StrengthTimelineView {
  return {
    rows: toRecordRows(overview.records, unit),
    isEmpty: !overview.has_qualifying_strength,
    hasPreviousPage: page.offset > 0,
    hasNextPage: page.offset + overview.records.length < page.total,
  };
}
