import { test } from "node:test";
import assert from "node:assert/strict";

import { homeReview, HOME_VOLUME_RANGE, type AnalyticsReadResult } from "./home-review.ts";
import type { AnalyticsOverview, PersonalRecordEntry, VolumePoint } from "./analytics-types.ts";

// Home's review column is a *bonus*: its job is to add what a 26rem column has no room for,
// never to put Home's launch surface at risk. These tests pin that — every degradation path
// yields `null` for the affected block rather than an error, an empty frame, or a zero.

// A successful read carrying `patch` over the baseline overview.
function read(patch: Partial<AnalyticsOverview> = {}): AnalyticsReadResult {
  return { success: true, data: overview(patch) };
}

function overview(patch: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    range: HOME_VOLUME_RANGE,
    available_ranges: [HOME_VOLUME_RANGE],
    sessions: 4,
    active_days: 3,
    total_sets: 40,
    muscle_distribution: [],
    recent_records: [],
    new_prs: 0,
    volume: { points: [], coverage: 100, delta: null },
    distance: { weeks: [], delta: null, has_distance: false },
    coverage: {
      weeks: 8,
      groups: [],
      unclassified_present: false,
      unclassified_sets: 0,
      muscles: { items: [], unclassified_present: false, unclassified_volume: 0 },
    },
    ...patch,
  };
}

const points: VolumePoint[] = [
  { date: "2026-09-01", volume_kg: 1000 },
  { date: "2026-09-03", volume_kg: 1200 },
];

const record: PersonalRecordEntry = {
  exercise: "Back Squat",
  estimated_1rm: 140,
  gain: 5,
  date: "2026-09-03",
  reps: 5,
  is_bodyweight: false,
  added_kg: null,
};

test("a rejected analytics read costs Home nothing", () => {
  // Arrange — `apiGet` rejects (not returns) on a transport failure or a non-JSON response,
  // so the page settles it to null. That path must degrade, not throw: the read sits in a
  // Promise.all beside the reads Home genuinely needs (#576 review).
  // Act
  const review = homeReview(null, "kg");
  // Assert — no throw, no error state, simply no review column.
  assert.equal(review.volume, null);
  assert.equal(review.records, null);
});

test("an unsuccessful envelope costs Home nothing", () => {
  // Arrange — the backend answered, but with `success: false`.
  // Act
  const review = homeReview({ success: false, data: null }, "kg");
  // Assert
  assert.equal(review.volume, null);
  assert.equal(review.records, null);
});

test("a successful envelope with no data costs Home nothing", () => {
  // The shape a 204 or a malformed success would produce.
  const review = homeReview({ success: true, data: null }, "kg");
  assert.equal(review.volume, null);
  assert.equal(review.records, null);
});

test("a window with nothing convertible renders no chart rather than an empty axis", () => {
  // Arrange — a bodyweight-only trainee converts no volume at all.
  const data = read({ volume: { points: [], coverage: 0, delta: null } });
  // Act
  const review = homeReview(data, "kg");
  // Assert
  assert.equal(review.volume, null);
});

test("an account with no Personal Records renders no records feed", () => {
  const review = homeReview(read({ recent_records: [] }), "kg");
  assert.equal(review.records, null);
});

test("a convertible window yields chart rows with text for every point", () => {
  // Arrange
  const data = read({ volume: { points, coverage: 80, delta: 12 } });
  // Act
  const review = homeReview(data, "kg");
  // Assert — ADR-0084: every plotted datum must be retrievable as text.
  assert.ok(review.volume);
  assert.equal(review.volume.rows.length, points.length);
  for (const row of review.volume.rows) {
    assert.ok(row.dateText.length > 0, "a point with no date text is unreachable");
    assert.ok(row.valueText.length > 0, "a point with no value text is unreachable");
  }
});

test("a first window shows the line with no delta rather than a fabricated +0%", () => {
  // Arrange — `delta: null` means there is no prior window to compare against.
  const data = read({ volume: { points, coverage: 100, delta: null } });
  // Act
  const review = homeReview(data, "kg");
  // Assert
  assert.ok(review.volume);
  assert.equal(review.volume.delta, null);
  assert.equal(review.volume.rows.length, points.length);
});

test("records carry a teaser into the full timeline once a PR exists", () => {
  const review = homeReview(read({ recent_records: [record] }), "kg");
  assert.ok(review.records);
  assert.equal(review.records.rows.length, 1);
  assert.ok(review.records.teaser);
  assert.equal(review.records.teaser.href, "/analytics/strength");
});

test("both blocks project into the reader's weight unit", () => {
  // Arrange — the same read, rendered for a lb reader.
  const data = read({
    volume: { points, coverage: 100, delta: null },
    recent_records: [record],
  });
  // Act
  const kg = homeReview(data, "kg");
  const lb = homeReview(data, "lb");
  // Assert — the unit reaches both the chart text and the record headline.
  assert.notEqual(kg.volume?.rows[0].valueText, lb.volume?.rows[0].valueText);
  assert.notEqual(kg.records?.rows[0].estimate, lb.records?.rows[0].estimate);
});

test("the window Home reads is one every History Depth can serve", () => {
  // ADR-0056 clamps a range to the user's depth; 30d is the floor, so a fixed 30d read can
  // never be clamped to something else and quietly disagree with the label beside it.
  assert.equal(HOME_VOLUME_RANGE, "30d");
});
