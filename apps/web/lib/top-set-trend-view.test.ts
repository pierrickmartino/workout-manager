import { test } from "node:test";
import assert from "node:assert/strict";

import { toTopSetTrend } from "./top-set-trend-view.ts";
import type { TopSetPoint } from "./exercise-stats-view.ts";

// `toTopSetTrend` turns the API's Top-Set series into the chart's rows and the `+N KG`
// delta pill (ADR-0017). It is the honest/degradation decision point: an empty series
// yields no rows (no chart), and a single-point series yields one row but no delta (no
// pill). Pure and server-free, so it is safe from a Client Component.

const THREE: TopSetPoint[] = [
  { date: "2026-01-01", estimated_1rm: 100 },
  { date: "2026-01-08", estimated_1rm: 105 },
  { date: "2026-01-15", estimated_1rm: 112 },
];

test("maps the series to oldest-first rows with the most recent flagged latest", () => {
  // Act
  const trend = toTopSetTrend(THREE);

  // Assert — one row per point, short labels, only the last flagged latest
  assert.deepEqual(trend.rows, [
    { date: "2026-01-01", label: "Jan 1", estimate: 100, isLatest: false },
    { date: "2026-01-08", label: "Jan 8", estimate: 105, isLatest: false },
    { date: "2026-01-15", label: "Jan 15", estimate: 112, isLatest: true },
  ]);
});

test("computes the delta as latest minus oldest in whole kilograms", () => {
  // Act — 112 − 100 = +12
  const trend = toTopSetTrend(THREE);

  // Assert
  assert.equal(trend.delta, "+12 KG");
});

test("rounds a fractional delta and signs a regression with a minus", () => {
  // Arrange — Epley estimates are fractional; here the latest is lighter than the oldest
  const series: TopSetPoint[] = [
    { date: "2026-01-01", estimated_1rm: 105.4 },
    { date: "2026-01-08", estimated_1rm: 100.1 },
  ];

  // Act — 100.1 − 105.4 = -5.3 → -5
  const trend = toTopSetTrend(series);

  // Assert
  assert.equal(trend.delta, "-5 KG");
});

test("a single qualifying session yields one row and no delta pill", () => {
  // Arrange — exactly one point; there is nothing to measure a trend against
  const series: TopSetPoint[] = [{ date: "2026-01-01", estimated_1rm: 100 }];

  // Act
  const trend = toTopSetTrend(series);

  // Assert — one bar, no pill
  assert.equal(trend.rows.length, 1);
  assert.equal(trend.rows[0].isLatest, true);
  assert.equal(trend.delta, null);
});

test("an empty series yields no rows and no delta, so no chart renders", () => {
  // Act
  const trend = toTopSetTrend([]);

  // Assert
  assert.deepEqual(trend.rows, []);
  assert.equal(trend.delta, null);
});
