import { test } from "node:test";
import assert from "node:assert/strict";

import { formatMonthYear, formatShortDate } from "./date-format.ts";

// `formatShortDate` renders an ISO date as a short "Mon D" label, parsed from the string
// parts so it is timezone-safe and deterministic across environments.

test("formats an ISO date as a short 'Mon D' label", () => {
  // Arrange / Act / Assert
  assert.equal(formatShortDate("2026-03-04"), "Mar 4");
});

test("drops the day's leading zero", () => {
  assert.equal(formatShortDate("2026-01-09"), "Jan 9");
});

test("is timezone-safe — never shifted a day by a local offset", () => {
  // A midnight-UTC date would roll back a day under a negative-offset Date parse; string
  // parsing keeps the calendar day intact.
  assert.equal(formatShortDate("2026-12-31"), "Dec 31");
});

// `formatMonthYear` names a `yyyy-mm` calendar month in full, for Month view's heading and
// count line (ADR-0138).

test("formats a calendar month as its full name and year", () => {
  assert.equal(formatMonthYear("2026-03"), "March 2026");
  assert.equal(formatMonthYear("2025-12"), "December 2025");
});

test("returns a string that is not a calendar month as-is", () => {
  assert.equal(formatMonthYear("2026-13"), "2026-13");
  assert.equal(formatMonthYear("march"), "march");
});
