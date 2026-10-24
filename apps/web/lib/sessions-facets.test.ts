import { test } from "node:test";
import assert from "node:assert/strict";

import { projectSessionFacets } from "./sessions-facets.ts";
import { EMPTY_SESSION_FILTERS, type SessionLibraryFilters } from "./session-library.ts";
import type { SessionFilterable } from "./session-library.ts";

// `sessions-facets` is the projection behind My Sessions' facet rail (ADR-0141): beside the
// Favorites toggle, each Training Type and each prescribed Exercise, how many Sessions picking
// it would show. Each facet's counts honour every *other* facet — the search included — and
// ignore their own, as on History (ADR-0139).

function row(
  training_type: string,
  exercise_names: string[],
  overrides: Partial<SessionFilterable> = {},
): SessionFilterable {
  return {
    training_type,
    exercise_names,
    name: null,
    created_at: "2026-09-01",
    is_favorite: false,
    ...overrides,
  };
}

const CLOSED = { query: "", expanded: false };

function facets(overrides: Partial<SessionLibraryFilters>): SessionLibraryFilters {
  return { ...EMPTY_SESSION_FILTERS, ...overrides };
}

const library = [
  row("strength", ["Back squat", "Bench press"], { name: "Leg day", is_favorite: true }),
  row("strength", ["Back squat"], { name: "Squat only" }),
  row("cardio", ["Rowing"], { name: "Erg", is_favorite: true }),
  row("hiit", ["Back squat", "Rowing"], { name: "Leg burner" }),
];

test("offers only the types present, each counted, with a share against the largest", () => {
  const rail = projectSessionFacets(library, EMPTY_SESSION_FILTERS, CLOSED);

  assert.deepEqual(
    rail.types.map(({ type, count, share }) => [type, count, share]),
    [
      ["strength", 2, 1],
      ["cardio", 1, 0.5],
      ["hiit", 1, 0.5],
    ],
  );
});

test("type counts honour the favorite, the exercise and the search, never the types", () => {
  const rail = projectSessionFacets(
    library,
    facets({ query: "leg", exercise: "Back squat", trainingTypes: ["strength"] }),
    CLOSED,
  );

  // "Leg day" (strength) and "Leg burner" (hiit) both name "leg" and prescribe the squat.
  assert.deepEqual(
    rail.types.map(({ type, count, selected }) => [type, count, selected]),
    [
      ["strength", 1, true],
      ["cardio", 0, false],
      ["hiit", 1, false],
    ],
  );
});

test("the favorite count honours the other facets and ignores its own toggle", () => {
  const off = projectSessionFacets(library, facets({ trainingTypes: ["strength"] }), CLOSED);
  const on = projectSessionFacets(
    library,
    facets({ trainingTypes: ["strength"], favorite: true }),
    CLOSED,
  );

  assert.deepEqual(off.favorite, { count: 1, selected: false });
  assert.deepEqual(on.favorite, { count: 1, selected: true });
});

test("a library with no favorites still offers the toggle, at zero", () => {
  const rail = projectSessionFacets([row("yoga", [])], EMPTY_SESSION_FILTERS, CLOSED);

  assert.deepEqual(rail.favorite, { count: 0, selected: false });
});

test("exercise counts honour the favorite, the types and the search, never the exercise", () => {
  const rail = projectSessionFacets(
    library,
    facets({ favorite: true, exercise: "Rowing" }),
    CLOSED,
  );

  // The two favorites: "Leg day" (squat, bench) and "Erg" (rowing).
  assert.deepEqual(
    rail.exercises.map(({ name, count, selected }) => [name, count, selected]),
    [
      ["Back squat", 1, false],
      ["Bench press", 1, false],
      ["Rowing", 1, true],
    ],
  );
});

test("the exercise list is every prescribed movement, most-counted first", () => {
  const rail = projectSessionFacets(library, EMPTY_SESSION_FILTERS, CLOSED);

  assert.deepEqual(
    rail.exercises.map(({ name, count }) => [name, count]),
    [
      ["Back squat", 3],
      ["Rowing", 2],
      ["Bench press", 1],
    ],
  );
  assert.equal(rail.hiddenExercises, 0);
});

test("the active count adds a search, the favorite, each type and the exercise", () => {
  assert.equal(projectSessionFacets(library, EMPTY_SESSION_FILTERS, CLOSED).activeCount, 0);
  assert.equal(projectSessionFacets(library, facets({ query: "  " }), CLOSED).activeCount, 0);
  assert.equal(
    projectSessionFacets(
      library,
      { query: "leg", favorite: true, trainingTypes: ["strength", "hiit"], exercise: "Rowing" },
      CLOSED,
    ).activeCount,
    5,
  );
});

test("a picked type the library does not hold stays listed, at zero, so it can be cleared", () => {
  const rail = projectSessionFacets(library, facets({ trainingTypes: ["pilates"] }), CLOSED);

  assert.deepEqual(rail.types.at(-1), { type: "pilates", count: 0, selected: true, share: 0 });
});
