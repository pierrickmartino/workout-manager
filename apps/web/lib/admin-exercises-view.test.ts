import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_ADMIN_FILTERS,
  adminFiltersToQuery,
  filterAdminExercises,
  hasActiveAdminFilters,
  matchesAdminFilters,
  parseAdminFilters,
  projectAdminExerciseRows,
  sortAdminExercises,
  toAdminExerciseRowView,
  type AdminExerciseFilters,
  type AdminExerciseRow,
} from "./admin-exercises-view.ts";

function row(overrides: Partial<AdminExerciseRow> = {}): AdminExerciseRow {
  return {
    id: 1,
    name: "Back Squat",
    provenance: "curated",
    completeness: "enriched",
    retired: false,
    ...overrides,
  };
}

test("projects a wire row to labels, a status, and the editor href", () => {
  // Arrange / Act
  const view = toAdminExerciseRowView(
    row({ id: 42, name: "Jefferson Curl", provenance: "user_entered", completeness: "stub" }),
  );

  // Assert — the ops labels and the link toward the editor
  assert.equal(view.href, "/admin/exercises/42");
  assert.equal(view.provenanceLabel, "User-entered");
  assert.equal(view.completenessLabel, "Stub");
  assert.equal(view.statusLabel, "Active");
});

test("a retired row reads as Retired", () => {
  const view = toAdminExerciseRowView(row({ retired: true }));
  assert.equal(view.retired, true);
  assert.equal(view.statusLabel, "Retired");
});

test("an unknown provenance or tier token falls back to itself", () => {
  const view = toAdminExerciseRowView(
    row({ provenance: "future_tier", completeness: "mystery" }),
  );
  assert.equal(view.provenanceLabel, "future_tier");
  assert.equal(view.completenessLabel, "mystery");
});

test("name search matches case-insensitively and trims", () => {
  const r = row({ name: "Front Squat" });
  assert.equal(matchesAdminFilters(r, { ...EMPTY_ADMIN_FILTERS, query: "  SQUAT " }), true);
  assert.equal(matchesAdminFilters(r, { ...EMPTY_ADMIN_FILTERS, query: "deadlift" }), false);
});

test("provenance and completeness facets narrow to that tier", () => {
  const r = row({ provenance: "ai_generated", completeness: "listable" });
  assert.equal(
    matchesAdminFilters(r, { ...EMPTY_ADMIN_FILTERS, provenance: "ai_generated" }),
    true,
  );
  assert.equal(
    matchesAdminFilters(r, { ...EMPTY_ADMIN_FILTERS, provenance: "curated" }),
    false,
  );
  assert.equal(
    matchesAdminFilters(r, { ...EMPTY_ADMIN_FILTERS, completeness: "listable" }),
    true,
  );
  assert.equal(
    matchesAdminFilters(r, { ...EMPTY_ADMIN_FILTERS, completeness: "enriched" }),
    false,
  );
});

test("status facet selects active or retired", () => {
  const active = row({ retired: false });
  const retired = row({ retired: true });
  assert.equal(matchesAdminFilters(active, { ...EMPTY_ADMIN_FILTERS, status: "active" }), true);
  assert.equal(matchesAdminFilters(retired, { ...EMPTY_ADMIN_FILTERS, status: "active" }), false);
  assert.equal(matchesAdminFilters(retired, { ...EMPTY_ADMIN_FILTERS, status: "retired" }), true);
  assert.equal(matchesAdminFilters(active, { ...EMPTY_ADMIN_FILTERS, status: "retired" }), false);
  // The default spans both.
  assert.equal(matchesAdminFilters(retired, EMPTY_ADMIN_FILTERS), true);
  assert.equal(matchesAdminFilters(active, EMPTY_ADMIN_FILTERS), true);
});

test("filters compose with AND semantics", () => {
  const rows = [
    row({ id: 1, name: "Barbell Squat", provenance: "curated", completeness: "listable", retired: false }),
    row({ id: 2, name: "Barbell Bench", provenance: "curated", completeness: "listable", retired: true }),
    row({ id: 3, name: "Barbell Squat Jump", provenance: "ai_generated", completeness: "listable" }),
    row({ id: 4, name: "Barbell Squat Stub", provenance: "curated", completeness: "stub" }),
  ];

  const kept = filterAdminExercises(rows, {
    query: "squat",
    provenance: "curated",
    completeness: "listable",
    status: "active",
  });

  assert.deepEqual(kept.map((r) => r.id), [1]);
});

test("sort orders by name A→Z with a stable id tiebreak, without mutating input", () => {
  const rows = [
    row({ id: 3, name: "Zercher Squat" }),
    row({ id: 1, name: "air squat" }),
    row({ id: 2, name: "Air Squat" }),
  ];
  const original = [...rows];

  const sorted = sortAdminExercises(rows);

  assert.deepEqual(
    sorted.map((r) => r.id),
    [1, 2, 3],
  );
  assert.deepEqual(rows, original, "input array is not reordered");
});

test("projectAdminExerciseRows filters and projects in one call", () => {
  const rows = sortAdminExercises([
    row({ id: 3, name: "Overhead Press", provenance: "ai_generated" }),
    row({ id: 1, name: "Back Squat", provenance: "curated" }),
    row({ id: 2, name: "Front Squat", provenance: "curated" }),
  ]);

  const views = projectAdminExerciseRows(rows, {
    ...EMPTY_ADMIN_FILTERS,
    provenance: "curated",
  });

  assert.deepEqual(
    views.map((v) => [v.name, v.href]),
    [
      ["Back Squat", "/admin/exercises/1"],
      ["Front Squat", "/admin/exercises/2"],
    ],
  );
});

test("hasActiveAdminFilters is false only for the empty state", () => {
  assert.equal(hasActiveAdminFilters(EMPTY_ADMIN_FILTERS), false);
  assert.equal(hasActiveAdminFilters({ ...EMPTY_ADMIN_FILTERS, query: "x" }), true);
  assert.equal(hasActiveAdminFilters({ ...EMPTY_ADMIN_FILTERS, status: "retired" }), true);
});

test("sorting once up front gives the same rows as sorting after every filter", () => {
  // Arrange — the browser holds the whole Catalog and refilters it on each keystroke, so the
  // sort is hoisted out of that path (ADR-0097). That is only safe while the two orders agree:
  // the filter preserves order, and the sort is stable, so filtering a sorted list must equal
  // sorting a filtered one. Names chosen to exercise the case-insensitive compare and the id
  // tiebreak between two movements sharing a name.
  const rows = [
    row({ id: 5, name: "front squat", provenance: "curated" }),
    row({ id: 2, name: "Back Squat", provenance: "ai_generated" }),
    row({ id: 9, name: "Back Squat", provenance: "curated" }),
    row({ id: 4, name: "Overhead Press", provenance: "curated" }),
    row({ id: 7, name: "Front Squat", provenance: "curated" }),
  ];
  const sorted = sortAdminExercises(rows);
  // The order the component replaced: sort *after* filtering, once per keystroke.
  const sortPerPass = (filters: AdminExerciseFilters) =>
    sortAdminExercises(filterAdminExercises(rows, filters)).map(toAdminExerciseRowView);

  for (const filters of [
    EMPTY_ADMIN_FILTERS,
    { ...EMPTY_ADMIN_FILTERS, provenance: "curated" },
    { ...EMPTY_ADMIN_FILTERS, query: "squat" },
    { ...EMPTY_ADMIN_FILTERS, query: "nothing matches this" },
  ]) {
    // Act / Assert
    assert.deepEqual(
      projectAdminExerciseRows(sorted, filters),
      sortPerPass(filters),
      JSON.stringify(filters),
    );
  }
});

test("projectAdminExerciseRows leaves the sorted list it was handed alone", () => {
  // Arrange — the component memoizes that array across every keystroke, so a projection that
  // mutated it would corrupt every later filter pass.
  const sorted = sortAdminExercises([
    row({ id: 2, name: "Back Squat" }),
    row({ id: 1, name: "Front Squat" }),
  ]);
  const before = [...sorted];

  // Act
  projectAdminExerciseRows(sorted, { ...EMPTY_ADMIN_FILTERS, query: "front" });

  // Assert
  assert.deepEqual(sorted, before);
});

// The filters round-trip through the URL (#7): an admin can share or bookmark a narrowed
// catalog, and a refresh restores it. The query string is untrusted input, so parsing is
// where a bogus facet has to die — a value the dropdown does not offer would otherwise
// select nothing and leave the control showing a facet nobody picked.

test("parseAdminFilters reads an empty query string as the unfiltered catalog", () => {
  // Arrange / Act
  const filters = parseAdminFilters(new URLSearchParams());

  // Assert
  assert.deepEqual(filters, EMPTY_ADMIN_FILTERS);
});

test("parseAdminFilters reads every facet the browser offers", () => {
  // Arrange
  const params = new URLSearchParams(
    "q=back+squat&provenance=ai_generated&completeness=stub&status=retired",
  );

  // Act
  const filters = parseAdminFilters(params);

  // Assert
  assert.deepEqual(filters, {
    query: "back squat",
    provenance: "ai_generated",
    completeness: "stub",
    status: "retired",
  });
});

test("parseAdminFilters drops a facet value the catalog's vocabulary does not contain", () => {
  // Arrange — a hand-edited or stale URL. Keeping `provenance=marketing` would filter the
  // list to nothing while the dropdown displayed "All provenance".
  const params = new URLSearchParams(
    "provenance=marketing&completeness=perfect&status=archived",
  );

  // Act
  const filters = parseAdminFilters(params);

  // Assert
  assert.deepEqual(filters, EMPTY_ADMIN_FILTERS);
});

test("parseAdminFilters collapses a whitespace-only query to no query", () => {
  // Arrange / Act
  const filters = parseAdminFilters(new URLSearchParams("q=%20%20"));

  // Assert
  assert.equal(filters.query, "");
  assert.equal(hasActiveAdminFilters(filters), false);
});

test("adminFiltersToQuery writes nothing for the unfiltered catalog", () => {
  // Arrange / Act
  const query = adminFiltersToQuery(EMPTY_ADMIN_FILTERS).toString();

  // Assert — a cleared filter leaves a bare URL rather than `?q=&status=all`.
  assert.equal(query, "");
});

test("adminFiltersToQuery omits the axes that impose no constraint", () => {
  // Arrange
  const filters: AdminExerciseFilters = {
    ...EMPTY_ADMIN_FILTERS,
    provenance: "curated",
  };

  // Act
  const query = adminFiltersToQuery(filters).toString();

  // Assert
  assert.equal(query, "provenance=curated");
});

test("a filter state survives the round-trip through the URL", () => {
  // Arrange — every axis set at once, including a query needing escaping.
  const filters: AdminExerciseFilters = {
    query: "overhead press",
    provenance: "user_entered",
    completeness: "listable",
    status: "active",
  };

  // Act
  const restored = parseAdminFilters(
    new URLSearchParams(adminFiltersToQuery(filters).toString()),
  );

  // Assert
  assert.deepEqual(restored, filters);
});
