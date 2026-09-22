import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HIGHLIGHT_PRIMARY_OPACITY,
  HIGHLIGHT_SECONDARY_OPACITY,
  MUSCLES_IN_GROUP,
  toExerciseHighlight,
} from "./exercise-highlight.ts";
import { MUSCLE_SPECS } from "./muscle-figure-spec.ts";

// `exercise-highlight` is the pure view-model behind the single-exercise Muscle Atlas highlight
// (issue #544): it turns the API's server-resolved Primary/Secondary highlight (canonical Muscles
// + coarse groups) into the figure's per-muscle fill (primary hot, secondary warm) and the text
// lists that name the highlighted muscles so nothing rides on the illustration or color. These
// tests pin the primary/secondary emphasis mapping and the coarse-group spread fallback.

test("MUSCLES_IN_GROUP nests every canonical muscle under exactly one group", () => {
  const nested = [...MUSCLES_IN_GROUP.values()].flat();
  // Every muscle appears once, and the union is the whole vocabulary — the frontend's copy of
  // the backend `MUSCLES_IN_GROUP` nesting (cross-checked against Python by the atlas contract).
  assert.equal(nested.length, MUSCLE_SPECS.length);
  assert.deepEqual(new Set(nested), new Set(MUSCLE_SPECS.map((spec) => spec.id)));
});

test("specific muscles map primary hot and secondary warm", () => {
  // Arrange — a bench press's server-resolved highlight: chest primary, arms/shoulders assist
  const view = toExerciseHighlight({
    primary: { muscles: ["Pectoralis Major"], groups: [] },
    secondary: { muscles: ["Triceps Brachii", "Deltoids"], groups: [] },
  });

  // Assert — each muscle lands in its emphasis lane at the matching opacity
  assert.equal(view.byMuscle.get("Pectoralis Major")?.emphasis, "primary");
  assert.equal(view.byMuscle.get("Pectoralis Major")?.opacity, HIGHLIGHT_PRIMARY_OPACITY);
  assert.equal(view.byMuscle.get("Triceps Brachii")?.emphasis, "secondary");
  assert.equal(view.byMuscle.get("Triceps Brachii")?.opacity, HIGHLIGHT_SECONDARY_OPACITY);
  assert.equal(view.byMuscle.get("Deltoids")?.emphasis, "secondary");
  // The text lists name exactly the highlighted muscles, split by emphasis, in canonical order
  // (Shoulders' Deltoids before Arms' Triceps Brachii, not the order they arrived in)
  assert.deepEqual(view.primaryMuscles, ["Pectoralis Major"]);
  assert.deepEqual(view.secondaryMuscles, ["Deltoids", "Triceps Brachii"]);
  assert.equal(view.isEmpty, false);
});

test("hot is a stronger highlight than warm", () => {
  // The two-level encoding must be ordered so primary always reads hotter than secondary.
  assert.ok(HIGHLIGHT_PRIMARY_OPACITY > HIGHLIGHT_SECONDARY_OPACITY);
});

test("a coarse group term spreads its highlight across every muscle in the group", () => {
  // Arrange — a plank whose only asserted muscle resolved to the bare "Core" group
  const view = toExerciseHighlight({
    primary: { muscles: [], groups: ["Core"] },
    secondary: { muscles: [], groups: [] },
  });

  // Assert — every muscle nested under Core lights primary, so the figure is never blank for a
  // real exercise; nothing outside the group is touched
  const coreMuscles = MUSCLES_IN_GROUP.get("Core") ?? [];
  assert.ok(coreMuscles.length > 1); // the group genuinely spreads
  for (const muscle of coreMuscles) {
    assert.equal(view.byMuscle.get(muscle)?.emphasis, "primary");
  }
  assert.deepEqual(view.primaryMuscles, coreMuscles);
  assert.equal(view.secondaryMuscles.length, 0);
});

test("a coarse group and a specific muscle combine without double counting", () => {
  // Arrange — Back named coarsely as secondary, with Latissimus Dorsi called out as primary
  const view = toExerciseHighlight({
    primary: { muscles: ["Latissimus Dorsi"], groups: [] },
    secondary: { muscles: [], groups: ["Back"] },
  });

  // Assert — the specific primary claim wins over the same muscle's coarse secondary spread,
  // and it appears in only one lane
  assert.equal(view.byMuscle.get("Latissimus Dorsi")?.emphasis, "primary");
  assert.deepEqual(view.primaryMuscles, ["Latissimus Dorsi"]);
  assert.ok(!view.secondaryMuscles.includes("Latissimus Dorsi"));
  // The rest of Back still lights warm
  assert.equal(view.byMuscle.get("Trapezius")?.emphasis, "secondary");
});

test("muscles are named in canonical order, not input order", () => {
  // Arrange — primary muscles given out of canonical order
  const view = toExerciseHighlight({
    primary: { muscles: ["Deltoids", "Quadriceps"], groups: [] },
    secondary: { muscles: [], groups: [] },
  });

  // Assert — the view re-orders to the canonical MUSCLE_SPECS order (Legs before Shoulders),
  // so the text list and the figure agree with every other atlas surface
  assert.deepEqual(view.primaryMuscles, ["Quadriceps", "Deltoids"]);
});

test("an all-off-map highlight is empty so the caller can fall back to text", () => {
  // Arrange — the backend placed nothing on the map (an AI-invented muscle, disclosed by absence)
  const view = toExerciseHighlight({
    primary: { muscles: [], groups: [] },
    secondary: { muscles: [], groups: [] },
  });

  // Assert — the figure has nothing to draw; the component shows the free-form text instead
  assert.equal(view.isEmpty, true);
  assert.equal(view.byMuscle.size, 0);
  assert.deepEqual(view.primaryMuscles, []);
  assert.deepEqual(view.secondaryMuscles, []);
});

test("an unknown muscle id is ignored rather than drawn", () => {
  // A stray id the figure can't draw (never emitted by the contract-checked backend) is dropped,
  // so the highlight never references a muscle with no path.
  const view = toExerciseHighlight({
    primary: { muscles: ["Not A Muscle"], groups: [] },
    secondary: { muscles: [], groups: [] },
  });
  assert.equal(view.isEmpty, true);
});
