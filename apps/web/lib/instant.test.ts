import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatInstantLocal,
  formatInstantUtc,
  normalizeApiInstant,
  parseApiInstant,
} from "./instant.ts";

// ADR-0096: an instant is a moment, not a wall clock. Two separate mistakes are possible
// between the API's string and the reader's eye — reading the string in the wrong zone, and
// writing it out in the wrong one — and the admin audit trail was making both.

test("a naive API instant is read as UTC, not as the reader's wall clock", () => {
  // Arrange — the backend stores `created_at` in a `TIMESTAMP WITHOUT TIME ZONE` column, so
  // `.isoformat()` emits a UTC moment with no offset on it. ES parses that form as *local*
  // time, which silently shifts every audit entry by the reader's offset.
  const naive = "2026-09-30T14:03:22.123456";

  // Act
  const epochMs = parseApiInstant(naive);

  // Assert
  assert.equal(epochMs, Date.UTC(2026, 8, 30, 14, 3, 22, 123));
});

test("an instant that states its own offset keeps it", () => {
  // Arrange / Act / Assert — assuming UTC is a reading of silence, never an override.
  assert.equal(parseApiInstant("2026-09-30T14:03:22Z"), Date.UTC(2026, 8, 30, 14, 3, 22));
  assert.equal(parseApiInstant("2026-09-30T16:03:22+02:00"), Date.UTC(2026, 8, 30, 14, 3, 22));
  assert.equal(parseApiInstant("2026-09-30T12:03:22-02:00"), Date.UTC(2026, 8, 30, 14, 3, 22));
});

test("a value that is not an instant is null, never the epoch", () => {
  // Arrange — a trail that renders "1 Jan 1970" for a malformed row has invented a fact.
  for (const value of ["", "   ", "not a date", "2026-13-45T99:99:99"]) {
    // Act / Assert
    assert.equal(parseApiInstant(value), null, JSON.stringify(value));
  }
});

test("the machine-readable form states the offset the string left out", () => {
  // Arrange / Act / Assert — what a `<time datetime>` carries, so an assistive technology or a
  // scraper reads the same moment a person does.
  assert.equal(normalizeApiInstant("2026-09-30T14:03:22.123456"), "2026-09-30T14:03:22.123456Z");
  assert.equal(normalizeApiInstant("2026-09-30 14:03:22"), "2026-09-30T14:03:22Z");
  assert.equal(normalizeApiInstant("2026-09-30T16:03:22+02:00"), "2026-09-30T16:03:22+02:00");
  assert.equal(normalizeApiInstant("not a date"), null);
});

test("the pre-hydration text names the clock it is in", () => {
  // Arrange
  const epochMs = Date.UTC(2026, 8, 30, 14, 3, 22);

  // Act
  const text = formatInstantUtc(epochMs);

  // Assert — read off UTC getters, so it is the same string on the server, in the first
  // client paint, and in every timezone the test runner happens to be set to.
  assert.equal(text, "2026-09-30 14:03 UTC");
});

test("the pre-hydration text pads every field", () => {
  // Arrange / Act / Assert — a "2026-1-1 4:3 UTC" would sort and scan wrong in a trail.
  assert.equal(formatInstantUtc(Date.UTC(2026, 0, 1, 4, 3, 0)), "2026-01-01 04:03 UTC");
});

test("the reader's text carries the year, so an old audit entry is not ambiguous", () => {
  // Arrange
  const epochMs = Date.UTC(2024, 1, 29, 9, 5, 0);

  // Act
  const text = formatInstantLocal(epochMs);

  // Assert — the zone and the ordering are the reader's; the year is ours to insist on.
  assert.match(text, /2024/);
  assert.notEqual(text, formatInstantLocal(epochMs + 60_000));
});
