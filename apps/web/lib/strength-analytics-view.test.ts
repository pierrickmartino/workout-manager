import { test } from "node:test";
import assert from "node:assert/strict";

import { toStrengthTimelineView } from "./strength-analytics-view.ts";
import type { StrengthAnalyticsOverview } from "./strength-analytics-types.ts";

// `toStrengthTimelineView` shapes the Strength Analytics screen's Personal Record
// timeline: it reuses the shared record-row formatting (rounded Estimated 1RM, a
// gain-or-"First PR" badge, a short date), decides the honest empty/gate state from
// `has_qualifying_strength`, and derives prev/next paging from the envelope's meta.
// Pure and server-free.

const RECORD = {
  exercise: "Back Squat",
  estimated_1rm: 110.0,
  gain: 10.0,
  date: "2026-07-04",
};

const OPEN: StrengthAnalyticsOverview = {
  has_qualifying_strength: true,
  records: [RECORD],
};

const PAGE = { limit: 20, offset: 0, total: 1 };

test("shapes the PR timeline into display rows, newest-first order preserved", () => {
  // Arrange — the API hands records newest-first already
  const overview: StrengthAnalyticsOverview = {
    has_qualifying_strength: true,
    records: [
      { ...RECORD, estimated_1rm: 110, date: "2026-07-04" },
      { ...RECORD, estimated_1rm: 100, gain: 0, date: "2026-06-01" },
    ],
  };

  // Act
  const view = toStrengthTimelineView(overview, { limit: 20, offset: 0, total: 2 });

  // Assert — each row carries Exercise · Estimated 1RM · gain badge · date, in order
  assert.equal(view.isEmpty, false);
  assert.deepEqual(
    view.rows.map((row) => [row.exercise, row.estimate, row.gain, row.date]),
    [
      ["Back Squat", "110 kg", "+10 kg", "Jul 4"],
      ["Back Squat", "100 kg", "First PR", "Jun 1"],
    ],
  );
});

test("reports an open gate as not-empty when the user has qualifying strength", () => {
  // Arrange / Act
  const view = toStrengthTimelineView(OPEN, PAGE);

  // Assert
  assert.equal(view.isEmpty, false);
});

test("marks a closed gate as empty with no rows for the honest empty state", () => {
  // Arrange — a user with no qualifying strength history
  const overview: StrengthAnalyticsOverview = {
    has_qualifying_strength: false,
    records: [],
  };

  // Act
  const view = toStrengthTimelineView(overview, { limit: 20, offset: 0, total: 0 });

  // Assert — the screen shows its explanatory empty state, never a fabricated row
  assert.equal(view.isEmpty, true);
  assert.deepEqual(view.rows, []);
});

test("has no previous page on the first page and a next page when more remain", () => {
  // Arrange — page one of a three-record timeline, one row per page
  const overview: StrengthAnalyticsOverview = {
    has_qualifying_strength: true,
    records: [RECORD],
  };

  // Act
  const view = toStrengthTimelineView(overview, { limit: 1, offset: 0, total: 3 });

  // Assert
  assert.equal(view.hasPreviousPage, false);
  assert.equal(view.hasNextPage, true);
});

test("has a previous page but no next page on the last page", () => {
  // Arrange — the final row of a three-record timeline
  const overview: StrengthAnalyticsOverview = {
    has_qualifying_strength: true,
    records: [RECORD],
  };

  // Act
  const view = toStrengthTimelineView(overview, { limit: 1, offset: 2, total: 3 });

  // Assert
  assert.equal(view.hasPreviousPage, true);
  assert.equal(view.hasNextPage, false);
});
