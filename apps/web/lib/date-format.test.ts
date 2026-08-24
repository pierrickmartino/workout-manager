import { test } from "node:test";
import assert from "node:assert/strict";

import { formatShortDate } from "./date-format.ts";

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
