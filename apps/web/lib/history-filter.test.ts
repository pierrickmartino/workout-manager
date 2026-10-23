import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveExerciseOptions,
  filterHistory,
  hasActiveFilters,
  historyFiltersToQuery,
  parseHistoryFilters,
} from "./history-filter.ts";
import type { HistoryIndexRow } from "./logs-types.ts";

// `history-filter` is the view-model behind the History screen's search/filter (the record
// side, ADR-0031). It operates purely on the already-fetched feed: an exercise search matches
// the *record* — each session's Logged Sets — not the plan (Q1), and a training-type filter
// reads each Logged Session's own `training_type` (Q3). The two facets intersect (AND), while
// multiple training types OR within their facet (Q7). All logic lives here so the History
// component stays thin and this stays trivially unit-testable.

// The History filters run over the index (ADR-0128): one slim row per record carrying the
// movements its Logged Sets performed, so filtering always sees the whole record even though
// full records arrive in windows.
function record(
  overrides: Partial<HistoryIndexRow> & { exercises?: string[] },
): HistoryIndexRow {
  const { exercises, ...rest } = overrides;
  return {
    id: 1,
    training_type: "strength",
    performed_on: "2026-06-20",
    deletable: true,
    uncompletable: true,
    ...rest,
    exercise_names: exercises ?? rest.exercise_names ?? [],
  };
}

// --- deriveExerciseOptions ---------------------------------------------------

test("deriveExerciseOptions returns the distinct exercises present in history, sorted", () => {
  // Arrange: two records, an exercise repeated across and within them
  const records = [
    record({ id: 1, exercises: ["Back Squat", "Bench Press"] }),
    record({ id: 2, exercises: ["Bench Press", "Deadlift"] }),
  ];

  // Act
  const options = deriveExerciseOptions(records);

  // Assert: deduped and alphabetical, only movements actually logged (Q5)
  assert.deepEqual(options, ["Back Squat", "Bench Press", "Deadlift"]);
});

test("deriveExerciseOptions is empty when no sessions have been logged", () => {
  assert.deepEqual(deriveExerciseOptions([]), []);
});

// --- filterHistory: exercise facet (matches the record, Q1) ------------------

test("filterHistory keeps only sessions whose Logged Sets include the picked exercise", () => {
  // Arrange
  const squatDay = record({ id: 1, exercises: ["Back Squat", "Leg Press"] });
  const benchDay = record({ id: 2, exercises: ["Bench Press"] });

  // Act
  const result = filterHistory([squatDay, benchDay], {
    exercise: "Back Squat",
    trainingTypes: [],
  });

  // Assert
  assert.deepEqual(
    result.map((r) => r.id),
    [1],
  );
});

test("filterHistory matches the performed record, not the plan — a substituted-in movement is found", () => {
  // Arrange: a plan-backed record whose Logged Sets show Leg Press — e.g. the user
  // substituted or logged it off-plan. The index lists what was performed, so searching
  // the record finds it (Q1).
  const planBacked = record({ id: 5, exercises: ["Leg Press"] });

  // Act
  const result = filterHistory([planBacked], {
    exercise: "Leg Press",
    trainingTypes: [],
  });

  // Assert
  assert.deepEqual(
    result.map((r) => r.id),
    [5],
  );
});

test("filterHistory with no exercise picked applies no exercise constraint", () => {
  const records = [
    record({ id: 1, exercises: ["Back Squat"] }),
    record({ id: 2, exercises: ["Bench Press"] }),
  ];

  const result = filterHistory(records, { exercise: null, trainingTypes: [] });

  assert.deepEqual(
    result.map((r) => r.id),
    [1, 2],
  );
});

// --- filterHistory: training-type facet (reads the record, Q3) ---------------

test("filterHistory keeps sessions of any selected training type (OR within the facet, Q7)", () => {
  // Arrange
  const strength = record({ id: 1, training_type: "strength" });
  const hiit = record({ id: 2, training_type: "hiit" });
  const yoga = record({ id: 3, training_type: "yoga" });

  // Act
  const result = filterHistory([strength, hiit, yoga], {
    exercise: null,
    trainingTypes: ["strength", "hiit"],
  });

  // Assert
  assert.deepEqual(
    result.map((r) => r.id),
    [1, 2],
  );
});

// --- filterHistory: the two facets intersect (AND, Q7) -----------------------

test("filterHistory intersects the exercise and training-type facets", () => {
  // Arrange: same exercise across two types; only the strength one should survive both facets
  const strengthSquat = record({
    id: 1,
    training_type: "strength",
    exercises: ["Back Squat"],
  });
  const hiitSquat = record({
    id: 2,
    training_type: "hiit",
    exercises: ["Back Squat"],
  });
  const strengthBench = record({
    id: 3,
    training_type: "strength",
    exercises: ["Bench Press"],
  });

  // Act
  const result = filterHistory([strengthSquat, hiitSquat, strengthBench], {
    exercise: "Back Squat",
    trainingTypes: ["strength"],
  });

  // Assert: Back Squat AND strength → only record 1
  assert.deepEqual(
    result.map((r) => r.id),
    [1],
  );
});

test("filterHistory returns a new array and preserves input order", () => {
  const records = [
    record({ id: 1, training_type: "strength" }),
    record({ id: 2, training_type: "strength" }),
  ];

  const result = filterHistory(records, {
    exercise: null,
    trainingTypes: ["strength"],
  });

  assert.notEqual(result, records); // immutability: never the same reference
  assert.deepEqual(
    result.map((r) => r.id),
    [1, 2],
  );
});

// --- parseHistoryFilters: URL -> filter state (Q8) ---------------------------

test("parseHistoryFilters reads the exercise and repeated type params", () => {
  // Arrange
  const params = new URLSearchParams(
    "exercise=Back+Squat&type=strength&type=hiit",
  );

  // Act
  const filters = parseHistoryFilters(params);

  // Assert
  assert.equal(filters.exercise, "Back Squat");
  assert.deepEqual(filters.trainingTypes, ["strength", "hiit"]);
});

test("parseHistoryFilters defaults to no filters when the params are empty", () => {
  const filters = parseHistoryFilters(new URLSearchParams(""));

  assert.equal(filters.exercise, null);
  assert.deepEqual(filters.trainingTypes, []);
});

test("parseHistoryFilters drops unknown training types and de-duplicates", () => {
  // Arrange: a bogus type and a repeat — the URL is untrusted input
  const params = new URLSearchParams(
    "type=strength&type=bogus&type=strength",
  );

  // Act
  const filters = parseHistoryFilters(params);

  // Assert: only the valid, distinct value survives
  assert.deepEqual(filters.trainingTypes, ["strength"]);
});

test("parseHistoryFilters treats a blank exercise as no exercise", () => {
  const filters = parseHistoryFilters(new URLSearchParams("exercise=+"));

  assert.equal(filters.exercise, null);
});

// --- historyFiltersToQuery: filter state -> URL, round-trip ------------------

test("historyFiltersToQuery round-trips through parseHistoryFilters", () => {
  // Arrange
  const filters = {
    exercise: "Bench Press",
    trainingTypes: ["strength", "yoga"],
    view: "list" as const,
    month: null,
  };

  // Act
  const query = historyFiltersToQuery(filters);
  const reparsed = parseHistoryFilters(new URLSearchParams(query.toString()));

  // Assert
  assert.deepEqual(reparsed, filters);
});

test("historyFiltersToQuery omits an unset exercise and empty types", () => {
  const query = historyFiltersToQuery({
    exercise: null,
    trainingTypes: [],
    view: "list",
    month: null,
  });

  assert.equal(query.toString(), "");
});

// --- hasActiveFilters: drives the "3 of 24" badge (Q9) -----------------------

test("hasActiveFilters is false only when neither facet is set", () => {
  assert.equal(
    hasActiveFilters({ exercise: null, trainingTypes: [] }),
    false,
  );
  assert.equal(
    hasActiveFilters({ exercise: "Back Squat", trainingTypes: [] }),
    true,
  );
  assert.equal(
    hasActiveFilters({ exercise: null, trainingTypes: ["hiit"] }),
    true,
  );
});

// --- view / month: the Month view's address (ADR-0100, ADR-0138) -------------

test("parseHistoryFilters opens the List view with no month when view is absent", () => {
  const filters = parseHistoryFilters(new URLSearchParams("type=yoga"));

  assert.equal(filters.view, "list");
  assert.equal(filters.month, null);
});

test("a Month view state round-trips through the URL alongside the facets", () => {
  // Arrange
  const filters = {
    exercise: "Back Squat",
    trainingTypes: ["strength"],
    view: "month" as const,
    month: "2026-03",
  };

  // Act
  const query = historyFiltersToQuery(filters);
  const reparsed = parseHistoryFilters(new URLSearchParams(query.toString()));

  // Assert
  assert.equal(query.get("view"), "month");
  assert.equal(query.get("month"), "2026-03");
  assert.deepEqual(reparsed, filters);
});

test("parseHistoryFilters drops a malformed month but keeps the Month view", () => {
  for (const month of ["2026-13", "2026-00", "2026-3", "26-03", "2026-03-01", "march", ""]) {
    // Act
    const filters = parseHistoryFilters(
      new URLSearchParams({ view: "month", month }),
    );

    // Assert
    assert.equal(filters.view, "month", month);
    assert.equal(filters.month, null, month);
  }
});

test("parseHistoryFilters ignores a month without view=month", () => {
  const filters = parseHistoryFilters(new URLSearchParams("month=2026-03"));

  assert.equal(filters.view, "list");
  assert.equal(filters.month, null);
});

test("parseHistoryFilters reads an unknown view as the List view", () => {
  const filters = parseHistoryFilters(
    new URLSearchParams("view=calendar&month=2026-03"),
  );

  assert.equal(filters.view, "list");
  assert.equal(filters.month, null);
});

test("historyFiltersToQuery writes nothing for the List view and drops a stale month", () => {
  // Arrange: a List state that still carries a month
  const filters = {
    exercise: null,
    trainingTypes: ["yoga"],
    view: "list" as const,
    month: "2026-03",
  };

  // Act
  const query = historyFiltersToQuery(filters);

  // Assert: the facets survive, the view and month do not
  assert.equal(query.toString(), "type=yoga");
});

test("historyFiltersToQuery writes a Month view with no month as the view alone", () => {
  const query = historyFiltersToQuery({
    exercise: null,
    trainingTypes: [],
    view: "month",
    month: null,
  });

  assert.equal(query.toString(), "view=month");
});
