import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_SESSIONS_CHIP,
  availableTypeChips,
  filterSessions,
  formatSessionDate,
  hasActiveSessionFilters,
  isSameChip,
  matchesSessionSearch,
  sessionFallbackLabel,
  sessionRowTitle,
  type SessionSummary,
} from "./session-library.ts";

// `session-library` is the My Sessions view-model (issue #397): the search + chip filter the
// client narrows the already-fetched library with, plus the row's title/date derivation. Its
// fallback-label matching mirrors the server's `session_label`, so client-side search has
// parity with the `GET /api/sessions` filter. Pure and server-free, so it is unit-tested here
// and the page/component stay thin.

function makeSummary(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: 1,
    training_type: "strength",
    name: "Leg Day A",
    display_name: "Leg Day A",
    created_at: "2026-08-25",
    author: { display_name: "Dana Lin" },
    is_favorite: false,
    exercise_count: 5,
    logged_count: 0,
    ...overrides,
  };
}

test("fallback label mirrors the server's training_type · date", () => {
  assert.equal(sessionFallbackLabel("cardio", "2026-08-25"), "cardio · 2026-08-25");
});

test("a blank query matches every session", () => {
  const summary = makeSummary({});
  assert.equal(matchesSessionSearch(summary, ""), true);
  assert.equal(matchesSessionSearch(summary, "   "), true);
});

test("search matches the user-given name case-insensitively", () => {
  const summary = makeSummary({ name: "Leg Day A", display_name: "Leg Day A" });
  assert.equal(matchesSessionSearch(summary, "leg"), true);
  assert.equal(matchesSessionSearch(summary, "DAY"), true);
});

test("search matches the training type", () => {
  const summary = makeSummary({ training_type: "mobility", name: null });
  assert.equal(matchesSessionSearch(summary, "mobil"), true);
});

test("search matches the derived fallback label of an unnamed session", () => {
  // A born-unnamed Session reads as "training_type · date"; searching the date finds it.
  const summary = makeSummary({
    name: null,
    training_type: "cardio",
    display_name: "cardio · 2026-08-25",
    created_at: "2026-08-25",
  });
  assert.equal(matchesSessionSearch(summary, "2026-08-25"), true);
});

test("search matches the fallback label even when the session is named", () => {
  // The named Session's display_name is its name, but the derived fallback label is still
  // searchable — parity with the server, whose predicate always searches the fallback.
  const summary = makeSummary({
    name: "Leg Day A",
    display_name: "Leg Day A",
    training_type: "strength",
    created_at: "2026-08-25",
  });
  assert.equal(matchesSessionSearch(summary, "2026-08-25"), true);
});

test("a non-matching query excludes the session", () => {
  const summary = makeSummary({ name: "Leg Day A", training_type: "strength" });
  assert.equal(matchesSessionSearch(summary, "yoga"), false);
});

test("isSameChip compares kind and training type", () => {
  assert.equal(isSameChip(ALL_SESSIONS_CHIP, { kind: "all" }), true);
  assert.equal(isSameChip({ kind: "favorites" }, { kind: "all" }), false);
  assert.equal(
    isSameChip({ kind: "type", trainingType: "yoga" }, { kind: "type", trainingType: "yoga" }),
    true,
  );
  assert.equal(
    isSameChip(
      { kind: "type", trainingType: "yoga" },
      { kind: "type", trainingType: "strength" },
    ),
    false,
  );
});

test("availableTypeChips lists only present types, in curated order", () => {
  // A library of yoga + strength shows those two chips only (no dead cardio/hiit/mobility),
  // ordered by the curated TRAINING_TYPES order (strength before yoga), never insertion order.
  const summaries = [
    makeSummary({ id: 1, training_type: "yoga" }),
    makeSummary({ id: 2, training_type: "strength" }),
    makeSummary({ id: 3, training_type: "yoga" }),
  ];
  assert.deepEqual(availableTypeChips(summaries), ["strength", "yoga"]);
});

test("availableTypeChips appends an uncurated type after the curated ones", () => {
  const summaries = [
    makeSummary({ id: 1, training_type: "crossfit" }),
    makeSummary({ id: 2, training_type: "strength" }),
  ];
  assert.deepEqual(availableTypeChips(summaries), ["strength", "crossfit"]);
});

test("filterSessions narrows to Favorites under the favorites chip", () => {
  const loved = makeSummary({ id: 1, name: "Loved", is_favorite: true });
  const plain = makeSummary({ id: 2, name: "Plain", is_favorite: false });

  const result = filterSessions([loved, plain], {
    query: "",
    chip: { kind: "favorites" },
  });

  assert.deepEqual(
    result.map((s) => s.id),
    [1],
  );
});

test("filterSessions narrows to one Training Type under a type chip", () => {
  const strength = makeSummary({ id: 1, training_type: "strength" });
  const yoga = makeSummary({ id: 2, training_type: "yoga" });

  const result = filterSessions([strength, yoga], {
    query: "",
    chip: { kind: "type", trainingType: "yoga" },
  });

  assert.deepEqual(
    result.map((s) => s.id),
    [2],
  );
});

test("filterSessions combines the search AND the chip", () => {
  // Only a favorited Session that also matches the search survives the combined filter.
  const legLoved = makeSummary({ id: 1, name: "Leg Day", is_favorite: true });
  const legPlain = makeSummary({ id: 2, name: "Leg Mobility", is_favorite: false });
  const pushLoved = makeSummary({ id: 3, name: "Push Day", is_favorite: true });

  const result = filterSessions([legLoved, legPlain, pushLoved], {
    query: "leg",
    chip: { kind: "favorites" },
  });

  assert.deepEqual(
    result.map((s) => s.id),
    [1],
  );
});

test("filterSessions returns the full list under the All chip, in input order", () => {
  const a = makeSummary({ id: 1, name: "A" });
  const b = makeSummary({ id: 2, name: "B" });

  const result = filterSessions([a, b], { query: "  ", chip: ALL_SESSIONS_CHIP });

  assert.deepEqual(
    result.map((s) => s.id),
    [1, 2],
  );
});

test("hasActiveSessionFilters reflects a non-blank query or a non-All chip", () => {
  assert.equal(
    hasActiveSessionFilters({ query: "", chip: ALL_SESSIONS_CHIP }),
    false,
  );
  assert.equal(
    hasActiveSessionFilters({ query: "  ", chip: ALL_SESSIONS_CHIP }),
    false,
  );
  assert.equal(
    hasActiveSessionFilters({ query: "leg", chip: ALL_SESSIONS_CHIP }),
    true,
  );
  assert.equal(
    hasActiveSessionFilters({ query: "", chip: { kind: "favorites" } }),
    true,
  );
  assert.equal(
    hasActiveSessionFilters({
      query: "",
      chip: { kind: "type", trainingType: "yoga" },
    }),
    true,
  );
});

test("formatSessionDate reshapes the calendar date without timezone drift", () => {
  assert.equal(formatSessionDate("2026-09-05"), "Sep 5, 2026");
  assert.equal(formatSessionDate("2026-01-31"), "Jan 31, 2026");
});

test("formatSessionDate returns a non-date string unchanged", () => {
  assert.equal(formatSessionDate("not-a-date"), "not-a-date");
});

test("sessionRowTitle uses the Session Name when set", () => {
  const summary = makeSummary({ name: "Upper Body", created_at: "2026-09-05" });
  assert.equal(sessionRowTitle(summary), "Upper Body");
});

test("sessionRowTitle falls back to the formatted date for an unnamed session", () => {
  // The Training Type is NOT in the title (it lives on the row's badge) — Q5 avoids the
  // "Strength / STRENGTH" double-print the server's `training_type · date` fallback would give.
  const summary = makeSummary({ name: null, created_at: "2026-09-05" });
  assert.equal(sessionRowTitle(summary), "Sep 5, 2026");
});
