import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterSessions,
  hasActiveSessionFilters,
  matchesSessionSearch,
  sessionFallbackLabel,
  type SessionSummary,
} from "./session-library.ts";

// `session-library` is the My Sessions view-model (issue #397): the search + favorites
// predicate the client filters the already-fetched library with. Its fallback-label
// matching mirrors the server's `session_label`, so client-side search has parity with
// the `GET /api/sessions` filter. Pure and server-free, so it is unit-tested here and the
// page/component stay thin.

function makeSummary(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: 1,
    training_type: "strength",
    name: "Leg Day A",
    display_name: "Leg Day A",
    created_at: "2026-08-25",
    author: { display_name: "Dana Lin" },
    is_favorite: false,
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

test("filterSessions applies the favorites-only flag", () => {
  const loved = makeSummary({ id: 1, name: "Loved", is_favorite: true });
  const plain = makeSummary({ id: 2, name: "Plain", is_favorite: false });

  const result = filterSessions([loved, plain], {
    query: "",
    favoritesOnly: true,
  });

  assert.deepEqual(
    result.map((s) => s.id),
    [1],
  );
});

test("filterSessions combines search AND favorites", () => {
  // Only a favorited Session that also matches the search survives the combined filter.
  const legLoved = makeSummary({ id: 1, name: "Leg Day", is_favorite: true });
  const legPlain = makeSummary({ id: 2, name: "Leg Mobility", is_favorite: false });
  const pushLoved = makeSummary({ id: 3, name: "Push Day", is_favorite: true });

  const result = filterSessions([legLoved, legPlain, pushLoved], {
    query: "leg",
    favoritesOnly: true,
  });

  assert.deepEqual(
    result.map((s) => s.id),
    [1],
  );
});

test("filterSessions returns the full list under an empty filter, in input order", () => {
  const a = makeSummary({ id: 1, name: "A" });
  const b = makeSummary({ id: 2, name: "B" });

  const result = filterSessions([a, b], { query: "  ", favoritesOnly: false });

  assert.deepEqual(
    result.map((s) => s.id),
    [1, 2],
  );
});

test("hasActiveSessionFilters reflects a non-blank query or the favorites flag", () => {
  assert.equal(
    hasActiveSessionFilters({ query: "", favoritesOnly: false }),
    false,
  );
  assert.equal(
    hasActiveSessionFilters({ query: "  ", favoritesOnly: false }),
    false,
  );
  assert.equal(
    hasActiveSessionFilters({ query: "leg", favoritesOnly: false }),
    true,
  );
  assert.equal(
    hasActiveSessionFilters({ query: "", favoritesOnly: true }),
    true,
  );
});
