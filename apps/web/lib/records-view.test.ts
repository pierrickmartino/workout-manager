import { test } from "node:test";
import assert from "node:assert/strict";

import { toRecordRows, toRecentRecordsTeaser } from "./records-view.ts";
import type { PersonalRecordEntry } from "./analytics-types.ts";

// `toRecordRows` turns the API's Personal Record entries into display rows for the
// Recent Records feed: a rounded Estimated 1RM, a gain-over-prior-PR badge (with a
// distinct "first PR" state), and a short human date. Pure and server-free.

const RECORD: PersonalRecordEntry = {
  exercise: "Back Squat",
  estimated_1rm: 110.0,
  gain: 10.0,
  date: "2026-07-04",
  reps: 1,
  is_bodyweight: false,
  added_kg: null,
};

test("formats a record's estimate, gain, and date for display", () => {
  // Arrange / Act
  const [row] = toRecordRows([RECORD]);

  // Assert
  assert.equal(row.exercise, "Back Squat");
  assert.equal(row.estimate, "110 kg");
  assert.equal(row.gain, "+10 kg");
  assert.equal(row.date, "Jul 4");
});

test("rounds a fractional Estimated 1RM to whole kilograms", () => {
  // Arrange — Epley estimates are often fractional (90 kg × 5 → 105 kg here)
  const record: PersonalRecordEntry = { ...RECORD, estimated_1rm: 105.4, gain: 5.4 };

  // Act
  const [row] = toRecordRows([record]);

  // Assert — the eye gets whole kilograms, not a long float
  assert.equal(row.estimate, "105 kg");
  assert.equal(row.gain, "+5 kg");
});

test("marks the first-ever PR distinctly instead of a zero gain", () => {
  // Arrange — a first-ever record carries no prior PR to improve on (gain 0)
  const record: PersonalRecordEntry = { ...RECORD, gain: 0 };

  // Act
  const [row] = toRecordRows([record]);

  // Assert — a clear "first" badge, never a misleading "+0 kg"
  assert.equal(row.gain, "First PR");
});

test("preserves the feed's newest-first order", () => {
  // Arrange — the API already hands records newest-first
  const older: PersonalRecordEntry = { ...RECORD, estimated_1rm: 100, date: "2026-06-01" };
  const newer: PersonalRecordEntry = { ...RECORD, estimated_1rm: 110, date: "2026-07-04" };

  // Act
  const rows = toRecordRows([newer, older]);

  // Assert — order is carried through untouched
  assert.deepEqual(
    rows.map((row) => row.estimate),
    ["110 kg", "100 kg"],
  );
});

test("renders a bodyweight record as the set that achieved it, never kilograms", () => {
  // Arrange — a pure bodyweight PR of 12 reps (its kg-equivalent estimate must not leak)
  const record: PersonalRecordEntry = {
    ...RECORD,
    exercise: "Pull-up",
    estimated_1rm: 90.0,
    reps: 12,
    is_bodyweight: true,
    added_kg: null,
  };

  // Act
  const [row] = toRecordRows([record]);

  // Assert — the set, not a fabricated kg headline (ADR-0026)
  assert.equal(row.estimate, "bodyweight × 12");
  assert.ok(!row.estimate.includes("kg"));
});

test("renders a weighted bodyweight record with its added load", () => {
  // Arrange — bodyweight + 20 kg for 5 reps
  const record: PersonalRecordEntry = {
    ...RECORD,
    exercise: "Dip",
    estimated_1rm: 125.0,
    reps: 5,
    is_bodyweight: true,
    added_kg: 20,
  };

  // Act
  const [row] = toRecordRows([record]);

  // Assert — the belt load shows; the kg-equivalent estimate never does
  assert.equal(row.estimate, "bodyweight + 20 kg × 5");
});

// `toRecentRecordsTeaser` decides the "See all records" affordance that links the
// account-wide Recent Records feed into the full PR timeline on the Strength Analytics
// screen — shown only when the user has qualifying strength history, so it never lands
// on an empty screen.

test("offers a teaser into the strength PR timeline when records exist", () => {
  // Arrange — the user has qualifying strength history in the feed
  // Act
  const teaser = toRecentRecordsTeaser([RECORD]);

  // Assert — a live affordance pointing at the Strength Analytics timeline
  assert.notEqual(teaser, null);
  assert.equal(teaser?.href, "/analytics/strength");
});

test("shows no teaser when the user has no qualifying strength history", () => {
  // Arrange — an empty feed means the strength screen would be an empty gate
  // Act
  const teaser = toRecentRecordsTeaser([]);

  // Assert — no dead link, consistent with the gated nav entry
  assert.equal(teaser, null);
});
