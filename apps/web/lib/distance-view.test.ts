import { test } from "node:test";
import assert from "node:assert/strict";

import { toDistanceBars, formatDistanceDelta } from "./distance-view.ts";
import type { DistanceWeek } from "./analytics-types.ts";

// `distance-view` turns the API's weekly distance series into chart-ready bar rows
// and the single disclosure that rides alongside the chart: the equal-window trend
// delta. There is no coverage caption — distance is exact metres (ADR-0049). Pure and
// server-free, like the other analytics view helpers.

const WEEKS: DistanceWeek[] = [
  { week: "2026-06-22", km: 24 },
  { week: "2026-06-29", km: 31.5 },
];

test("maps weeks to bar rows with a short week label, preserving order", () => {
  // Arrange / Act
  const rows = toDistanceBars(WEEKS);

  // Assert — ISO Monday kept for the axis, plus a human "Mon D" label and the km
  assert.deepEqual(rows, [
    { week: "2026-06-22", label: "Jun 22", km: 24 },
    { week: "2026-06-29", label: "Jun 29", km: 31.5 },
  ]);
});

test("returns no rows for an empty series", () => {
  // Arrange / Act / Assert — the empty state is handled by the caller, not fabricated
  assert.deepEqual(toDistanceBars([]), []);
});

test("formats a positive delta with a leading plus and whole percent", () => {
  // Arrange / Act / Assert
  assert.equal(formatDistanceDelta(18.4), "+18%");
});

test("formats a negative delta with its sign, no extra plus", () => {
  // Arrange / Act / Assert — a decline is shown honestly, not hidden
  assert.equal(formatDistanceDelta(-5.2), "-5%");
});

test("withholds the delta when there is no prior-window baseline", () => {
  // Arrange / Act / Assert — null in, null out: the badge is simply not shown
  assert.equal(formatDistanceDelta(null), null);
});
