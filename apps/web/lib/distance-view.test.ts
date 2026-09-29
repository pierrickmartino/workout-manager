import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toDistanceBars,
  formatDistanceDelta,
  DISTANCE_VALUES_CAPTION,
} from "./distance-view.ts";
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

  // Assert — ISO Monday kept for the axis, a short "Mon D" tick, the km, and the
  // retrievable text pair the tooltip and the values table both render (ADR-0084)
  assert.deepEqual(rows, [
    {
      week: "2026-06-22", label: "Jun 22", km: 24,
      weekText: "Week of Jun 22, 2026", valueText: "24 km",
    },
    {
      week: "2026-06-29", label: "Jun 29", km: 31.5,
      weekText: "Week of Jun 29, 2026", valueText: "31.5 km",
    },
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

// --- Retrievable values (ADR-0084) -----------------------------------------------------

test("renders a zero week as an explicit figure, never a blank", () => {
  // Arrange — a week that logged distance work covering none. The bar has no height to
  // see and no path to hover, so the values table is the only place it is legible.
  const weeks: DistanceWeek[] = [{ week: "2026-06-22", km: 0 }];

  // Act
  const [row] = toDistanceBars(weeks);

  // Assert
  assert.equal(row.valueText, "0 km");
});

test("keeps a fractional distance at the precision the chart plots", () => {
  // Arrange / Act — distance is exact metres (ADR-0049); nothing is rounded away
  const [row] = toDistanceBars([{ week: "2026-06-22", km: 3.25 }]);

  // Assert
  assert.equal(row.valueText, "3.25 km");
});

test("gives every week a name that can be placed without its neighbours", () => {
  // Arrange — two Mondays either side of a year boundary
  const weeks: DistanceWeek[] = [
    { week: "2025-12-29", km: 10 },
    { week: "2026-01-05", km: 12 },
  ];

  // Act
  const rows = toDistanceBars(weeks);

  // Assert
  assert.deepEqual(
    rows.map((row) => row.weekText),
    ["Week of Dec 29, 2025", "Week of Jan 5, 2026"],
  );
});

test("distinguishes an unlogged week from a zero week in its caption", () => {
  // Arrange / Act / Assert — the API buckets only weeks that logged distance, so an
  // absent week and a 0 km week are different facts and the caption says which is which
  assert.match(DISTANCE_VALUES_CAPTION, /no distance logged has no row/);
  assert.match(DISTANCE_VALUES_CAPTION, /0 km row logged distance work that covered none/);
});
