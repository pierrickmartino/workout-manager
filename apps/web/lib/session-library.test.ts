import { test } from "node:test";
import assert from "node:assert/strict";

import {
  availableTrainingTypes,
  EMPTY_SESSION_FILTERS,
  filterSessions,
  formatSessionDate,
  hasActiveSessionFilters,
  matchesSessionSearch,
  parseSessionFilters,
  sessionFallbackLabel,
  sessionFiltersToQuery,
  sessionRowTitle,
  type SessionLibraryFilters,
  type SessionSummary,
} from "./session-library.ts";

// `session-library` is the My Sessions view-model (issue #397, ADR-0141): the facets the client
// narrows the already-fetched library with — search, Favorites, Training Types and one Exercise — plus the row's title/date derivation. Its
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
    authored_by_me: true,
    is_favorite: false,
    exercise_count: 5,
    logged_count: 0,
    last_performed_on: null,
    preview_exercises: [],
    exercise_names: [],
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

function filters(overrides: Partial<SessionLibraryFilters>): SessionLibraryFilters {
  return { ...EMPTY_SESSION_FILTERS, ...overrides };
}

test("availableTrainingTypes lists only present types, in curated order", () => {
  // A library of yoga + strength offers those two types only (no dead cardio/hiit/mobility),
  // ordered by the curated TRAINING_TYPES order (strength before yoga), never insertion order.
  const summaries = [
    makeSummary({ id: 1, training_type: "yoga" }),
    makeSummary({ id: 2, training_type: "strength" }),
    makeSummary({ id: 3, training_type: "yoga" }),
  ];
  assert.deepEqual(availableTrainingTypes(summaries), ["strength", "yoga"]);
});

test("availableTrainingTypes appends an uncurated type after the curated ones", () => {
  const summaries = [
    makeSummary({ id: 1, training_type: "crossfit" }),
    makeSummary({ id: 2, training_type: "strength" }),
  ];
  assert.deepEqual(availableTrainingTypes(summaries), ["strength", "crossfit"]);
});

test("filterSessions narrows to Favorites when the favorite facet is on", () => {
  const loved = makeSummary({ id: 1, name: "Loved", is_favorite: true });
  const plain = makeSummary({ id: 2, name: "Plain", is_favorite: false });

  const result = filterSessions([loved, plain], filters({ favorite: true }));

  assert.deepEqual(result.map((s) => s.id), [1]);
});

test("filterSessions ORs the selected Training Types", () => {
  const strength = makeSummary({ id: 1, training_type: "strength" });
  const yoga = makeSummary({ id: 2, training_type: "yoga" });
  const cardio = makeSummary({ id: 3, training_type: "cardio" });

  const result = filterSessions(
    [strength, yoga, cardio],
    filters({ trainingTypes: ["yoga", "cardio"] }),
  );

  assert.deepEqual(result.map((s) => s.id), [2, 3]);
});

test("filterSessions matches an Exercise anywhere in the plan, not only the preview", () => {
  const long = makeSummary({
    id: 1,
    preview_exercises: ["Back Squat", "Leg Press", "Lunge"],
    exercise_names: ["Back Squat", "Calf Raise", "Leg Press", "Lunge"],
  });
  const other = makeSummary({ id: 2, exercise_names: ["Bench Press"] });

  const result = filterSessions([long, other], filters({ exercise: "Calf Raise" }));

  assert.deepEqual(result.map((s) => s.id), [1]);
});

test("filterSessions combines every facet with AND", () => {
  // Only a favorited strength Session that names "leg" and prescribes the squat survives.
  const match = makeSummary({ id: 1, name: "Leg Day", is_favorite: true, exercise_names: ["Back Squat"] });
  const notFavorite = makeSummary({ id: 2, name: "Leg Day", exercise_names: ["Back Squat"] });
  const wrongType = makeSummary({ id: 3, name: "Leg Flow", training_type: "yoga", is_favorite: true, exercise_names: ["Back Squat"] });
  const wrongName = makeSummary({ id: 4, name: "Push Day", is_favorite: true, exercise_names: ["Back Squat"] });
  const wrongExercise = makeSummary({ id: 5, name: "Leg Day", is_favorite: true, exercise_names: ["Leg Press"] });

  const result = filterSessions(
    [match, notFavorite, wrongType, wrongName, wrongExercise],
    { query: "leg", favorite: true, trainingTypes: ["strength"], exercise: "Back Squat" },
  );

  assert.deepEqual(result.map((s) => s.id), [1]);
});

test("filterSessions returns the full list when no facet is set, in input order", () => {
  const a = makeSummary({ id: 1, name: "A" });
  const b = makeSummary({ id: 2, name: "B" });

  const result = filterSessions([a, b], filters({ query: "  " }));

  assert.deepEqual(result.map((s) => s.id), [1, 2]);
});

test("hasActiveSessionFilters is true for any set facet and ignores a blank query", () => {
  assert.equal(hasActiveSessionFilters(EMPTY_SESSION_FILTERS), false);
  assert.equal(hasActiveSessionFilters(filters({ query: "  " })), false);
  assert.equal(hasActiveSessionFilters(filters({ query: "leg" })), true);
  assert.equal(hasActiveSessionFilters(filters({ favorite: true })), true);
  assert.equal(hasActiveSessionFilters(filters({ trainingTypes: ["yoga"] })), true);
  assert.equal(hasActiveSessionFilters(filters({ exercise: "Back Squat" })), true);
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

// --- parseSessionFilters / sessionFiltersToQuery: URL <-> filter state --------
// The My Sessions facets round-trip through the URL (via `replaceFilterQuery`, like History)
// so a refreshed or shared link restores the narrowed view: `query`, `favorite=1`, a repeated
// `type` and one `exercise` (ADR-0141). A pre-rail `chip=` link is still read.

test("parseSessionFilters reads every facet", () => {
  const parsed = parseSessionFilters(
    new URLSearchParams("query=press&favorite=1&type=strength&type=hiit&exercise=Back+Squat"),
  );

  assert.deepEqual(parsed, {
    query: "press",
    favorite: true,
    trainingTypes: ["strength", "hiit"],
    exercise: "Back Squat",
  });
});

test("parseSessionFilters keeps a type outside the curated set and drops repeats", () => {
  // The type facet is derived from the library itself (`availableTrainingTypes`), which keeps
  // types outside the curated five, so a shared link to `pilates` must survive.
  const parsed = parseSessionFilters(new URLSearchParams("type=pilates&type=pilates&type=+"));

  assert.deepEqual(parsed.trainingTypes, ["pilates"]);
});

test("parseSessionFilters defaults every facet off when the params are empty", () => {
  assert.deepEqual(parseSessionFilters(new URLSearchParams("")), EMPTY_SESSION_FILTERS);
});

test("parseSessionFilters ignores an unrecognised favorite value and a blank exercise", () => {
  const parsed = parseSessionFilters(new URLSearchParams("favorite=yes&exercise=++"));

  assert.equal(parsed.favorite, false);
  assert.equal(parsed.exercise, null);
});

test("parseSessionFilters still reads a pre-rail chip link", () => {
  assert.deepEqual(
    parseSessionFilters(new URLSearchParams("query=leg&chip=favorites")),
    filters({ query: "leg", favorite: true }),
  );
  assert.deepEqual(
    parseSessionFilters(new URLSearchParams("chip=type:pilates")),
    filters({ trainingTypes: ["pilates"] }),
  );
});

test("parseSessionFilters drops a bogus chip, and the new params win over it", () => {
  assert.deepEqual(parseSessionFilters(new URLSearchParams("chip=bogus")), EMPTY_SESSION_FILTERS);
  assert.deepEqual(parseSessionFilters(new URLSearchParams("chip=type:")), EMPTY_SESSION_FILTERS);
  assert.deepEqual(
    parseSessionFilters(new URLSearchParams("chip=favorites&type=yoga")),
    filters({ trainingTypes: ["yoga"] }),
  );
});

test("sessionFiltersToQuery round-trips every facet through parseSessionFilters", () => {
  const all: SessionLibraryFilters = {
    query: "leg day",
    favorite: true,
    trainingTypes: ["cardio", "crossfit"],
    exercise: "Back Squat",
  };

  const reparsed = parseSessionFilters(
    new URLSearchParams(sessionFiltersToQuery(all).toString()),
  );

  assert.deepEqual(reparsed, all);
});

test("sessionFiltersToQuery writes nothing for unset facets and never a chip", () => {
  assert.equal(sessionFiltersToQuery(filters({ query: "  " })).toString(), "");
  assert.equal(
    sessionFiltersToQuery(filters({ favorite: true })).toString(),
    "favorite=1",
  );
});
