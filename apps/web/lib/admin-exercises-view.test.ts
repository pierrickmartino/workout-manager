import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_ADMIN_FILTERS,
  filterAdminExercises,
  hasActiveAdminFilters,
  matchesAdminFilters,
  selectAdminExerciseRows,
  sortAdminExercises,
  toAdminExerciseRowView,
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

test("selectAdminExerciseRows filters, sorts, and projects in one call", () => {
  const rows = [
    row({ id: 3, name: "Overhead Press", provenance: "ai_generated" }),
    row({ id: 1, name: "Back Squat", provenance: "curated" }),
    row({ id: 2, name: "Front Squat", provenance: "curated" }),
  ];

  const views = selectAdminExerciseRows(rows, {
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
