import { test } from "node:test";
import assert from "node:assert/strict";

import { toMuscleRegionAtlas } from "./muscle-region-atlas-view.ts";
import type { MuscleCoverage, RecentCoverage } from "./analytics-types.ts";

// `toMuscleRegionAtlas` is the muscle-granularity successor to `muscle-atlas-view`: it turns
// the API's per-muscle coverage tier into render-ready data for the anatomical atlas — a flat
// list of per-muscle regions (each carrying its trained/not-trained state as text, in-window
// set count, emphasis-weighted heat intensity, contributing exercises, and a color-independent
// screen-reader label) plus a two-level group→muscle text structure so the section stays
// legible without the illustration, a labeled window, an honest empty-state flag, and the
// neutral off-map disclosure (issue #541 / ADR-0025/0073). Descriptive only — it names
// presence and volume in the server's canonical order, it never ranks, reshuffles, or flags.

function muscle(
  name: string,
  groupName: string,
  volume: number,
  exercises: { name: string; sets: number }[] = [],
): MuscleCoverage {
  return {
    muscle: name,
    group: groupName,
    present: volume > 0,
    volume,
    contributing_exercises: exercises,
  };
}

// Build a coverage read around a per-muscle tier. The six-group tier is irrelevant to this
// view-model (it derives its group→muscle bands from the muscle rows themselves), so it is a
// minimal consistent stub; the off-map disclosure lives on the muscle tier.
function coverageOf(
  items: MuscleCoverage[],
  opts: { weeks?: number; unclassifiedVolume?: number } = {},
): RecentCoverage {
  const unclassifiedVolume = opts.unclassifiedVolume ?? 0;
  return {
    weeks: opts.weeks ?? 8,
    groups: [],
    unclassified_present: false,
    unclassified_sets: 0,
    muscles: {
      items,
      unclassified_present: unclassifiedVolume > 0,
      unclassified_volume: unclassifiedVolume,
    },
  };
}

// Legs (2 muscles, one trained), Chest (1, trained), Back (1, untrained) — enough to exercise
// the two-level structure, per-muscle heat, set counts, and roll-up without listing all ~40.
const SAMPLE: RecentCoverage = coverageOf([
  muscle("Quadriceps", "Legs", 8, [
    { name: "Back Squat", sets: 6 },
    { name: "Leg Press", sets: 2 },
  ]),
  muscle("Hamstrings", "Legs", 0),
  muscle("Pectoralis Major", "Chest", 4, [{ name: "Bench Press", sets: 4 }]),
  muscle("Latissimus Dorsi", "Back", 0),
]);

test("maps each muscle to a region in the server's canonical order with its state as text", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.deepEqual(
    view.regions.map((region) => [region.muscle, region.group, region.covered, region.stateLabel]),
    [
      ["Quadriceps", "Legs", true, "Trained"],
      ["Hamstrings", "Legs", false, "Not trained"],
      ["Pectoralis Major", "Chest", true, "Trained"],
      ["Latissimus Dorsi", "Back", false, "Not trained"],
    ],
  );
});

test("counts each region's in-window sets from the exercises behind it", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.equal(view.regions[0].sets, 8); // 6 + 2
  assert.equal(view.regions[2].sets, 4);
  assert.equal(view.regions[1].sets, 0); // untrained muscle contributes no sets
});

test("scales heat intensity to the busiest muscle's emphasis-weighted volume (0–1)", () => {
  // Quadriceps (volume 8) is the busiest, so intensity 1; Pectoralis Major (4) is half of it
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.equal(view.regions[0].intensity, 1);
  assert.equal(view.regions[2].intensity, 0.5);
  assert.equal(view.regions[1].intensity, 0); // untrained muscle is cold
});

test("intensity is descriptive relative volume, never a rank — canonical order is preserved", () => {
  // A later-in-canonical-order muscle carries more heat; the view must NOT reorder by volume.
  const view = toMuscleRegionAtlas(
    coverageOf([
      muscle("Quadriceps", "Legs", 2, [{ name: "Front Squat", sets: 2 }]),
      muscle("Hamstrings", "Legs", 10, [{ name: "Deadlift", sets: 10 }]),
    ]),
  );
  assert.deepEqual(
    view.regions.map((region) => region.muscle),
    ["Quadriceps", "Hamstrings"],
  );
  assert.equal(view.regions[0].intensity, 0.2); // 2 / 10, the busiest is the max, not a target
  assert.equal(view.regions[1].intensity, 1);
});

test("exposes the full contributing exercise list, empty for an untrained muscle", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.deepEqual(view.regions[0].contributingExercises, [
    { name: "Back Squat", sets: 6 },
    { name: "Leg Press", sets: 2 },
  ]);
  assert.deepEqual(view.regions[1].contributingExercises, []);
});

test("gives each region a screen-reader label naming muscle, state, window, and volume", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.equal(
    view.regions[0].ariaLabel,
    "Quadriceps: trained in the last 8 weeks, 8 sets",
  );
  assert.equal(
    view.regions[1].ariaLabel,
    "Hamstrings: not trained in the last 8 weeks",
  );
});

test("singularizes the set word for a one-set muscle", () => {
  const view = toMuscleRegionAtlas(
    coverageOf([muscle("Quadriceps", "Legs", 1, [{ name: "Back Squat", sets: 1 }])]),
  );
  assert.equal(
    view.regions[0].ariaLabel,
    "Quadriceps: trained in the last 8 weeks, 1 set",
  );
});

test("labels the window from the read model's week count", () => {
  assert.equal(toMuscleRegionAtlas(SAMPLE).weeksLabel, "last 8 weeks");
  assert.equal(toMuscleRegionAtlas(coverageOf([], { weeks: 12 })).weeksLabel, "last 12 weeks");
});

test("builds the two-level group→muscle structure in canonical order", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.deepEqual(
    view.groups.map((section) => [
      section.group,
      section.muscles.map((region) => region.muscle),
    ]),
    [
      ["Legs", ["Quadriceps", "Hamstrings"]],
      ["Chest", ["Pectoralis Major"]],
      ["Back", ["Latissimus Dorsi"]],
    ],
  );
});

test("nests the very same region objects under their group (no divergent copy)", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.equal(view.groups[0].muscles[0], view.regions[0]);
});

test("rolls a group section's state up from its muscles", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  const [legs, chest, back] = view.groups;

  // Legs: one of two muscles trained → covered, trainedCount 1 of 2
  assert.deepEqual(
    [legs.group, legs.covered, legs.stateLabel, legs.trainedCount, legs.muscleCount],
    ["Legs", true, "Trained", 1, 2],
  );
  assert.deepEqual([chest.covered, chest.trainedCount, chest.muscleCount], [true, 1, 1]);
  // Back: its only muscle is untrained → the whole group reads not trained
  assert.deepEqual([back.covered, back.stateLabel, back.trainedCount], [false, "Not trained", 0]);
});

test("gives each group section a screen-reader label naming group, state, and window", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.equal(view.groups[0].ariaLabel, "Legs: 1 of 2 muscles trained in the last 8 weeks");
  assert.equal(view.groups[2].ariaLabel, "Back: not trained in the last 8 weeks");
});

test("is not empty when at least one muscle has been trained", () => {
  assert.equal(toMuscleRegionAtlas(SAMPLE).isEmpty, false);
});

test("is empty when nothing was trained and no off-map work exists", () => {
  const view = toMuscleRegionAtlas(
    coverageOf([muscle("Quadriceps", "Legs", 0), muscle("Pectoralis Major", "Chest", 0)]),
  );
  assert.equal(view.isEmpty, true);
});

test("has no footnote and zero off-map volume when all work maps to a muscle", () => {
  const view = toMuscleRegionAtlas(SAMPLE);
  assert.equal(view.footnote, null);
  assert.equal(view.unclassifiedVolume, 0);
});

test("surfaces a neutral footnote and the off-map volume when unclassified work exists", () => {
  const view = toMuscleRegionAtlas(
    coverageOf(
      [muscle("Quadriceps", "Legs", 6, [{ name: "Back Squat", sets: 6 }])],
      { unclassifiedVolume: 3.5 },
    ),
  );
  assert.equal(view.footnote, "Some recent sets list muscles we don't map yet.");
  assert.equal(view.unclassifiedVolume, 3.5);
});

test("reads only-unclassified history as all-not-trained regions with the footnote, not empty", () => {
  const view = toMuscleRegionAtlas(
    coverageOf(
      [muscle("Quadriceps", "Legs", 0), muscle("Pectoralis Major", "Chest", 0)],
      { unclassifiedVolume: 2 },
    ),
  );
  // Real work exists, it just maps to no muscle — not the "log a few sessions" empty state
  assert.equal(view.isEmpty, false);
  assert.ok(view.regions.every((region) => !region.covered));
  assert.equal(view.footnote, "Some recent sets list muscles we don't map yet.");
});
