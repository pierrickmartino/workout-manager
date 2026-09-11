import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toVolumeRows,
  formatVolumeDelta,
  formatCoverageCaption,
} from "./volume-view.ts";
import type { VolumePoint } from "./analytics-types.ts";

// `volume-view` turns the API's daily volume series into chart-ready rows and the
// two disclosures that ride alongside the chart: the equal-window trend delta and
// the coverage caption. Pure and server-free, like the other analytics view helpers.

const POINTS: VolumePoint[] = [
  { date: "2026-07-04", volume_kg: 400 },
  { date: "2026-07-05", volume_kg: 1000 },
];

test("maps points to chart rows with a short day label, preserving order", () => {
  // Arrange / Act
  const rows = toVolumeRows(POINTS, "kg");

  // Assert — ISO date kept for the axis, plus a human "Mon D" label and the kg volume
  assert.deepEqual(rows, [
    { date: "2026-07-04", label: "Jul 4", volume: 400 },
    { date: "2026-07-05", label: "Jul 5", volume: 1000 },
  ]);
});

test("projects the volume into the reader's pounds", () => {
  // Arrange / Act — a lb reader sees the tonnage converted from kilograms.
  const rows = toVolumeRows(POINTS, "lb");

  // Assert — 400 kg ≈ 881.85 lb, 1000 kg ≈ 2204.62 lb (raw for a proportional line).
  assert.ok(Math.abs(rows[0].volume - 881.849) < 0.01);
  assert.ok(Math.abs(rows[1].volume - 2204.62) < 0.01);
});

test("returns no rows for an empty series", () => {
  // Arrange / Act / Assert — the empty state is handled by the caller, not fabricated
  assert.deepEqual(toVolumeRows([], "kg"), []);
});

test("formats a positive delta with a leading plus and whole percent", () => {
  // Arrange / Act / Assert
  assert.equal(formatVolumeDelta(24.6), "+25%");
});

test("formats a negative delta with its sign, no extra plus", () => {
  // Arrange / Act / Assert — a decline is shown honestly, not hidden
  assert.equal(formatVolumeDelta(-8.2), "-8%");
});

test("withholds the delta when there is no prior-window baseline", () => {
  // Arrange / Act / Assert — null in, null out: the badge is simply not shown
  assert.equal(formatVolumeDelta(null), null);
});

test("caption discloses the coverage as a whole percent of logged volume", () => {
  // Arrange / Act / Assert
  assert.equal(
    formatCoverageCaption(82.4),
    "from 82% of your logged volume",
  );
});
