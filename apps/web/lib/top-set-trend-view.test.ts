import { test } from "node:test";
import assert from "node:assert/strict";

import { toTopSetTrend, TOP_SET_VALUES_CAPTION } from "./top-set-trend-view.ts";
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
  const trend = toTopSetTrend(THREE, "kg");

  // Assert — one row per point, short ticks, only the last flagged latest, plus the
  // index key and the retrievable text pair (ADR-0084)
  assert.deepEqual(trend.rows, [
    {
      key: "0", date: "2026-01-01", label: "Jan 1", estimate: 100, isLatest: false,
      dateText: "Jan 1, 2026", valueText: "100 kg",
    },
    {
      key: "1", date: "2026-01-08", label: "Jan 8", estimate: 105, isLatest: false,
      dateText: "Jan 8, 2026", valueText: "105 kg",
    },
    {
      key: "2", date: "2026-01-15", label: "Jan 15", estimate: 112, isLatest: true,
      dateText: "Jan 15, 2026", valueText: "112 kg",
    },
  ]);
});

test("computes the delta as latest minus oldest in whole kilograms", () => {
  // Act — 112 − 100 = +12
  const trend = toTopSetTrend(THREE, "kg");

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
  const trend = toTopSetTrend(series, "kg");

  // Assert
  assert.equal(trend.delta, "-5 KG");
});

test("a single qualifying session yields one row and no delta pill", () => {
  // Arrange — exactly one point; there is nothing to measure a trend against
  const series: TopSetPoint[] = [{ date: "2026-01-01", estimated_1rm: 100 }];

  // Act
  const trend = toTopSetTrend(series, "kg");

  // Assert — one bar, no pill
  assert.equal(trend.rows.length, 1);
  assert.equal(trend.rows[0].isLatest, true);
  assert.equal(trend.delta, null);
});

test("an empty series yields no rows and no delta, so no chart renders", () => {
  // Act
  const trend = toTopSetTrend([], "kg");

  // Assert
  assert.deepEqual(trend.rows, []);
  assert.equal(trend.delta, null);
});

test("toTopSetTrend projects bar estimates and the delta into pounds", () => {
  // Arrange — two points, 100 kg then 110 kg, read by a lb user.
  const series = [
    { date: "2026-07-01", estimated_1rm: 100 },
    { date: "2026-07-08", estimated_1rm: 110 },
  ];

  // Act
  const trend = toTopSetTrend(series, "lb");

  // Assert — bar heights are the raw lb projection; the delta is +22 LB (10 kg gain).
  assert.ok(Math.abs(trend.rows[0].estimate - 220.462) < 0.01);
  assert.equal(trend.delta, "+22 LB");
});

// --- Retrievable values (ADR-0084) -----------------------------------------------------

test("keys rows by series position so two sessions on one date both survive", () => {
  // Arrange — the app is calendar-free: two Logged Sessions can be performed on one date,
  // and `top_set_series` yields one point per qualifying session. A date-keyed row would
  // collide and drop a bar.
  const sameDay: TopSetPoint[] = [
    { date: "2026-03-14", estimated_1rm: 100 },
    { date: "2026-03-14", estimated_1rm: 104 },
  ];

  // Act
  const trend = toTopSetTrend(sameDay, "kg");

  // Assert — two distinct keys, both values retrievable, and the dates honestly identical:
  // the API sends no session identity, so nothing here invents one.
  assert.deepEqual(trend.rows.map((row) => row.key), ["0", "1"]);
  assert.deepEqual(trend.rows.map((row) => row.valueText), ["100 kg", "104 kg"]);
  assert.deepEqual(
    trend.rows.map((row) => row.dateText),
    ["Mar 14, 2026", "Mar 14, 2026"],
  );
});

test("rounds the retrievable estimate to the displayed whole figure", () => {
  // Arrange — an Epley estimate is fractional; the chart and the PR tile show it whole
  const series: TopSetPoint[] = [{ date: "2026-01-01", estimated_1rm: 112.4917 }];

  // Act
  const [row] = toTopSetTrend(series, "kg").rows;

  // Assert — the bar keeps the fraction, the retrievable text is the headline precision
  assert.equal(row.estimate, 112.4917);
  assert.equal(row.valueText, "112 kg");
});

test("projects the retrievable estimate into the reader's pounds with its unit", () => {
  // Arrange / Act — 100 kg ≈ 220 lb at whole-figure precision
  const [row] = toTopSetTrend([{ date: "2026-01-01", estimated_1rm: 100 }], "lb").rows;

  // Assert
  assert.equal(row.valueText, "220 lb");
});

test("names the value an estimate and an absent session unqualifying in its caption", () => {
  // Arrange / Act / Assert — the caption restates the ADR-0017 qualification rules the
  // chart already applies; it adds no new estimate and no training target
  assert.match(TOP_SET_VALUES_CAPTION, /Estimated 1RM/);
  assert.match(TOP_SET_VALUES_CAPTION, /not a weight lifted/);
  assert.match(TOP_SET_VALUES_CAPTION, /no qualifying set has no row/);
});
