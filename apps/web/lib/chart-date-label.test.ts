import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDayLabel,
  formatFullDayLabel,
  formatFullWeekLabel,
} from "./chart-date-label.ts";

test("formats a short axis label as month and day without a year", () => {
  // Arrange
  const iso = "2026-09-28";
  // Act
  const label = formatDayLabel(iso);
  // Assert
  assert.equal(label, "Sep 28");
});

test("formats a full value label with the year", () => {
  // Arrange
  const iso = "2026-09-28";
  // Act
  const label = formatFullDayLabel(iso);
  // Assert
  assert.equal(label, "Sep 28, 2026");
});

test("distinguishes adjacent dates that sit either side of a year boundary", () => {
  // Arrange — the CH-F2 fixture: two neighbouring points whose short labels cannot be ordered.
  const december = "2025-12-29";
  const january = "2026-01-05";
  // Act
  const short = [formatDayLabel(december), formatDayLabel(january)];
  const full = [formatFullDayLabel(december), formatFullDayLabel(january)];
  // Assert
  assert.deepEqual(short, ["Dec 29", "Jan 5"]);
  assert.deepEqual(full, ["Dec 29, 2025", "Jan 5, 2026"]);
});

test("names a week by its Monday, with the year", () => {
  // Arrange
  const monday = "2025-12-29";
  // Act
  const label = formatFullWeekLabel(monday);
  // Assert
  assert.equal(label, "Week of Dec 29, 2025");
});

test("reads a date from its string parts rather than a local-time Date", () => {
  // Arrange — a date whose UTC midnight falls on the previous day west of Greenwich;
  // `new Date(iso).getDate()` would answer 31 in those zones.
  const iso = "2026-01-01";
  // Act
  const label = formatFullDayLabel(iso);
  // Assert
  assert.equal(label, "Jan 1, 2026");
});

test("formats every month with its short name", () => {
  // Arrange
  const isos = Array.from({ length: 12 }, (_, index) =>
    `2026-${String(index + 1).padStart(2, "0")}-15`);
  // Act
  const labels = isos.map(formatDayLabel);
  // Assert
  assert.deepEqual(labels, [
    "Jan 15", "Feb 15", "Mar 15", "Apr 15", "May 15", "Jun 15",
    "Jul 15", "Aug 15", "Sep 15", "Oct 15", "Nov 15", "Dec 15",
  ]);
});
