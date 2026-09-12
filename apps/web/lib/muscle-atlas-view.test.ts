import { test } from "node:test";
import assert from "node:assert/strict";

import { toAtlasView } from "./muscle-atlas-view.ts";
import type { GroupCoverage, RecentCoverage } from "./analytics-types.ts";

// `toAtlasView` turns the API's enriched six-group coverage read into the Muscle Atlas view
// for the Analytics screen: six real-group regions (canonical order) each carrying its
// trained/not-trained state, in-window set count, share, heat intensity, contributing
// exercises, and a color-independent screen-reader label, plus a labeled window, an
// empty-state flag, a neutral off-map footnote, and the unclassified set count (task #9 /
// ADR-0025). Descriptive only — it names presence and volume, it never flags or ranks.

function group(
  name: string,
  covered: boolean,
  sets: number,
  exercises: { name: string; sets: number }[] = [],
): GroupCoverage {
  return { group: name, covered, sets, contributing_exercises: exercises };
}

const BALANCED: RecentCoverage = {
  weeks: 8,
  unclassified_present: false,
  unclassified_sets: 0,
  groups: [
    group("Legs", true, 20, [
      { name: "Back Squat", sets: 12 },
      { name: "Leg Press", sets: 8 },
    ]),
    group("Chest", true, 10, [{ name: "Bench Press", sets: 10 }]),
    group("Back", true, 5),
    group("Shoulders", false, 0),
    group("Arms", false, 0),
    group("Core", false, 0),
  ],
};

test("maps each group to a region in canonical order with its state as text", () => {
  const view = toAtlasView(BALANCED);

  assert.deepEqual(
    view.regions.map((region) => [region.group, region.covered, region.stateLabel]),
    [
      ["Legs", true, "Trained"],
      ["Chest", true, "Trained"],
      ["Back", true, "Trained"],
      ["Shoulders", false, "Not trained"],
      ["Arms", false, "Not trained"],
      ["Core", false, "Not trained"],
    ],
  );
});

test("carries each region's in-window set count", () => {
  const view = toAtlasView(BALANCED);
  assert.equal(view.regions[0].sets, 20);
  assert.equal(view.regions[3].sets, 0);
});

test("computes each region's share of in-window real-group sets, rounded", () => {
  // Total real-group sets = 20 + 10 + 5 = 35; Legs is 20/35 ≈ 57%
  const view = toAtlasView(BALANCED);
  assert.equal(view.regions[0].sharePct, 57);
  assert.equal(view.regions[1].sharePct, 29);
  assert.equal(view.regions[3].sharePct, 0);
});

test("scales heat intensity to the busiest group (0–1)", () => {
  // Legs (20 sets) is the max, so intensity 1; Back (5) is a quarter of that
  const view = toAtlasView(BALANCED);
  assert.equal(view.regions[0].intensity, 1);
  assert.equal(view.regions[2].intensity, 0.25);
  assert.equal(view.regions[3].intensity, 0);
});

test("exposes the top exercise for the list row and the full list for the drawer", () => {
  const view = toAtlasView(BALANCED);
  assert.equal(view.regions[0].topExercise, "Back Squat");
  assert.deepEqual(view.regions[0].contributingExercises, [
    { name: "Back Squat", sets: 12 },
    { name: "Leg Press", sets: 8 },
  ]);
  // An untrained region has no top exercise and an empty list
  assert.equal(view.regions[3].topExercise, null);
  assert.deepEqual(view.regions[3].contributingExercises, []);
});

test("gives each region a screen-reader label naming state, window, and volume", () => {
  const view = toAtlasView(BALANCED);
  assert.equal(view.regions[0].ariaLabel, "Legs: trained in the last 8 weeks, 20 sets");
  assert.equal(view.regions[3].ariaLabel, "Shoulders: not trained in the last 8 weeks");
});

test("singularizes the set word for a one-set region", () => {
  const one: RecentCoverage = {
    weeks: 8,
    unclassified_present: false,
    unclassified_sets: 0,
    groups: [group("Legs", true, 1, [{ name: "Back Squat", sets: 1 }])],
  };
  assert.equal(toAtlasView(one).regions[0].ariaLabel, "Legs: trained in the last 8 weeks, 1 set");
});

test("labels the window from the read model's week count", () => {
  assert.equal(toAtlasView(BALANCED).weeksLabel, "last 8 weeks");
});

test("is not empty when at least one group has been trained", () => {
  assert.equal(toAtlasView(BALANCED).isEmpty, false);
});

test("is empty when nothing was trained and no off-map work exists", () => {
  const none: RecentCoverage = {
    weeks: 8,
    unclassified_present: false,
    unclassified_sets: 0,
    groups: BALANCED.groups.map((g) => group(g.group, false, 0)),
  };
  const view = toAtlasView(none);
  assert.equal(view.isEmpty, true);
  assert.equal(view.regions.length, 6);
});

test("has no footnote and zero unclassified sets when all work maps to the six", () => {
  const view = toAtlasView(BALANCED);
  assert.equal(view.footnote, null);
  assert.equal(view.unclassifiedSets, 0);
});

test("surfaces a neutral footnote and the off-map count when unclassified work exists", () => {
  const withUnclassified: RecentCoverage = {
    ...BALANCED,
    unclassified_present: true,
    unclassified_sets: 8,
  };
  const view = toAtlasView(withUnclassified);
  assert.equal(view.footnote, "Some recent sets list muscles we don't map yet.");
  assert.equal(view.unclassifiedSets, 8);
});

test("reads only-unclassified history as six not-trained regions with the footnote", () => {
  const onlyUnclassified: RecentCoverage = {
    weeks: 8,
    unclassified_present: true,
    unclassified_sets: 4,
    groups: BALANCED.groups.map((g) => group(g.group, false, 0)),
  };
  const view = toAtlasView(onlyUnclassified);
  // Real work exists, it just maps to no group — not the "log a few sessions" empty state
  assert.equal(view.isEmpty, false);
  assert.ok(view.regions.every((region) => !region.covered));
  assert.equal(view.footnote, "Some recent sets list muscles we don't map yet.");
});
