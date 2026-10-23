import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXERCISE_PREVIEW,
  projectHistoryFacets,
} from "./history-facets.ts";
import type { HistoryIndexRow } from "./logs-types.ts";

// `history-facets` is the projection behind History's facet rail (ADR-0139): beside each
// Training Type and each logged exercise, how many Logged Sessions picking it would show. It
// reads the History index (ADR-0128) and the facets, and nothing else.

function row(
  id: number,
  training_type: string,
  exercise_names: string[],
): HistoryIndexRow {
  return {
    id,
    performed_on: "2026-09-01",
    training_type,
    exercise_names,
    deletable: true,
    uncompletable: true,
  };
}

const NO_FACETS = { exercise: null, trainingTypes: [] };
const CLOSED = { query: "", expanded: false };

const index = [
  row(1, "strength", ["Back squat", "Bench press"]),
  row(2, "strength", ["Back squat"]),
  row(3, "cardio", ["Rowing"]),
  row(4, "hiit", ["Back squat", "Rowing"]),
];

test("counts every Training Type in the curated set, including the ones never logged", () => {
  const rail = projectHistoryFacets(index, NO_FACETS, CLOSED);

  assert.deepEqual(
    rail.types.map((facet) => [facet.type, facet.count]),
    [["strength", 2], ["cardio", 1], ["hiit", 1], ["yoga", 0], ["mobility", 0]],
  );
});

test("a type's count honours the exercise facet but ignores the type facet itself", () => {
  const rail = projectHistoryFacets(
    index,
    { exercise: "Back squat", trainingTypes: ["strength"] },
    CLOSED,
  );

  const counts = Object.fromEntries(rail.types.map((facet) => [facet.type, facet.count]));
  // An unselected type still shows what adding it would bring in (types OR together).
  assert.equal(counts.hiit, 1);
  assert.equal(counts.cardio, 0);
  assert.equal(counts.strength, 2);
});

test("marks the selected types and sizes each bar against the largest count", () => {
  const rail = projectHistoryFacets(index, { exercise: null, trainingTypes: ["cardio"] }, CLOSED);

  const cardio = rail.types.find((facet) => facet.type === "cardio");
  const strength = rail.types.find((facet) => facet.type === "strength");
  assert.equal(cardio?.selected, true);
  assert.equal(strength?.selected, false);
  assert.equal(strength?.share, 1);
  assert.equal(cardio?.share, 0.5);
});

test("an empty record sizes every bar at zero rather than dividing by zero", () => {
  const rail = projectHistoryFacets([], NO_FACETS, CLOSED);

  assert.ok(rail.types.every((facet) => facet.share === 0));
  assert.deepEqual(rail.exercises, []);
});

test("an exercise's count honours the type facet but ignores the exercise facet itself", () => {
  const rail = projectHistoryFacets(
    index,
    { exercise: "Rowing", trainingTypes: ["strength", "hiit"] },
    CLOSED,
  );

  const counts = Object.fromEntries(rail.exercises.map((facet) => [facet.name, facet.count]));
  assert.deepEqual(counts, { "Back squat": 3, "Bench press": 1, Rowing: 1 });
});

test("lists exercises most-logged first, ties alphabetical", () => {
  const rail = projectHistoryFacets(
    [...index, row(5, "cardio", ["Bench press"])],
    NO_FACETS,
    CLOSED,
  );

  assert.deepEqual(
    rail.exercises.map((facet) => facet.name),
    ["Back squat", "Bench press", "Rowing"],
  );
});

const many = Array.from({ length: EXERCISE_PREVIEW + 3 }, (_, i) =>
  row(i + 1, "strength", [`Move ${String.fromCharCode(65 + i)}`]),
);

test("previews the most-logged exercises and says how many more there are", () => {
  const rail = projectHistoryFacets(many, NO_FACETS, CLOSED);

  assert.equal(rail.exercises.length, EXERCISE_PREVIEW);
  assert.equal(rail.hiddenExercises, 3);
});

test("expanding lists every exercise", () => {
  const rail = projectHistoryFacets(many, NO_FACETS, { query: "", expanded: true });

  assert.equal(rail.exercises.length, EXERCISE_PREVIEW + 3);
  assert.equal(rail.hiddenExercises, 0);
});

test("a find query narrows by case-insensitive substring and lifts the preview cap", () => {
  const rail = projectHistoryFacets(index, NO_FACETS, { query: "  ROW ", expanded: false });

  assert.deepEqual(rail.exercises.map((facet) => facet.name), ["Rowing"]);
  assert.equal(rail.hiddenExercises, 0);
});

test("the selected exercise stays on screen even past the preview or outside the query", () => {
  const pastPreview = projectHistoryFacets(
    many,
    { exercise: "Move I", trainingTypes: [] },
    CLOSED,
  );
  assert.equal(pastPreview.exercises[0].name, "Move I");
  assert.equal(pastPreview.exercises[0].selected, true);
  assert.equal(pastPreview.hiddenExercises, 2);

  const outsideQuery = projectHistoryFacets(
    index,
    { exercise: "Rowing", trainingTypes: [] },
    { query: "squat", expanded: false },
  );
  assert.deepEqual(outsideQuery.exercises.map((facet) => facet.name), ["Rowing", "Back squat"]);
});

test("an exercise from a shared link the record never performed still shows, to be cleared", () => {
  const rail = projectHistoryFacets(index, { exercise: "Snatch", trainingTypes: [] }, CLOSED);

  assert.deepEqual(rail.exercises[0], { name: "Snatch", count: 0, selected: true });
});

test("counts the active facets for the phone's collapsed summary", () => {
  assert.equal(projectHistoryFacets(index, NO_FACETS, CLOSED).activeCount, 0);
  assert.equal(
    projectHistoryFacets(
      index,
      { exercise: "Rowing", trainingTypes: ["cardio", "hiit"] },
      CLOSED,
    ).activeCount,
    3,
  );
});
