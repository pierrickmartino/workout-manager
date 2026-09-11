import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogQuery,
  catalogFiltersToParams,
  hasActiveFilters,
  parseCatalogFilters,
  toggleFacetValue,
} from "./exercise-browse-query.ts";
import type { CatalogFilters } from "./exercise-browse-types.ts";

function filters(overrides: Partial<CatalogFilters> = {}): CatalogFilters {
  return { query: "", muscleGroups: [], equipment: [], difficulty: [], ...overrides };
}

test("omits a blank query and pagination from the facet params", () => {
  const params = catalogFiltersToParams(filters({ query: "   " }));
  assert.equal(params.toString(), "");
});

test("appends each facet value as a repeated param", () => {
  const params = catalogFiltersToParams(
    filters({
      query: "squat",
      muscleGroups: ["Legs", "Core"],
      equipment: ["barbell"],
      difficulty: ["beginner"],
    }),
  );
  assert.equal(params.getAll("muscle_group").join(","), "Legs,Core");
  assert.equal(params.get("query"), "squat");
  assert.equal(params.get("equipment"), "barbell");
  assert.equal(params.get("difficulty"), "beginner");
});

test("buildCatalogQuery adds limit and offset onto the facet params", () => {
  const query = buildCatalogQuery(filters({ muscleGroups: ["Legs"] }), {
    limit: 20,
    offset: 40,
  });
  const parsed = new URLSearchParams(query);
  assert.equal(parsed.get("muscle_group"), "Legs");
  assert.equal(parsed.get("limit"), "20");
  assert.equal(parsed.get("offset"), "40");
});

test("parseCatalogFilters reads a single or repeated facet from the URL bag", () => {
  const parsed = parseCatalogFilters({
    query: "row",
    muscle_group: ["Back", "Arms"],
    equipment: "dumbbell",
  });
  assert.deepEqual(parsed, {
    query: "row",
    muscleGroups: ["Back", "Arms"],
    equipment: ["dumbbell"],
    difficulty: [],
  });
});

test("toggleFacetValue adds when absent and removes when present, without mutating", () => {
  const original = ["Legs"];
  const added = toggleFacetValue(original, "Core");
  assert.deepEqual(added, ["Legs", "Core"]);
  assert.deepEqual(toggleFacetValue(added, "Legs"), ["Core"]);
  assert.deepEqual(original, ["Legs"]); // pure: the input is untouched
});

test("hasActiveFilters is false only for the empty, whitespace-query default", () => {
  assert.equal(hasActiveFilters(filters({ query: "  " })), false);
  assert.equal(hasActiveFilters(filters({ muscleGroups: ["Legs"] })), true);
  assert.equal(hasActiveFilters(filters({ query: "squat" })), true);
});
