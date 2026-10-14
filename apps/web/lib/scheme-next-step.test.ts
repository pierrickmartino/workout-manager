import { test } from "node:test";
import assert from "node:assert/strict";

import { schemeNextStep } from "./scheme-next-step.ts";
import type { Load } from "./load.ts";

// `scheme-next-step` is the Scheme Preview split into the parts a set table places: what changes
// next, the condition that earns it, and what a miss costs. It must agree with the sentence
// (`scheme-preview`) on every branch, above all on Load-kind honesty: kilograms only on a weight
// axis, reps on pure bodyweight, and a hold wherever there is nothing clean to step.

const ABSOLUTE: Load = { kind: "absolute", text: "60kg", kg: 60 };
const WEIGHTED_BODYWEIGHT: Load = { kind: "bodyweight", text: "+10kg", added_kg: 10 };
const PURE_BODYWEIGHT: Load = { kind: "bodyweight", text: "Bodyweight" };
const PERCENT: Load = { kind: "percent_1rm", text: "70% 1RM", percent: 70 };

test("Double Progression on a weight axis adds kilograms and names its back-off", () => {
  assert.deepEqual(schemeNextStep("double_progression", "8-12", ABSOLUTE), {
    kind: "step",
    moves: "load",
    change: "+2.5 kg",
    when: "every set reaches 12 at RPE 7 or lower",
    otherwise: "miss the 8-rep floor and it backs off 5 kg",
  });
});

test("Double Progression on weighted bodyweight steps the added load", () => {
  const step = schemeNextStep("double_progression", "6-10", WEIGHTED_BODYWEIGHT);
  assert.equal(step.kind === "step" && step.moves, "load");
});

test("Double Progression on pure bodyweight with a range adds a rep, never kilograms", () => {
  assert.deepEqual(schemeNextStep("double_progression", "8-12", PURE_BODYWEIGHT), {
    kind: "step",
    moves: "reps",
    change: "+1 rep",
    when: "every set reaches 12 at RPE 7 or lower",
    otherwise: null,
  });
});

test("Double Progression on pure bodyweight at a single target offers a harder variation", () => {
  const step = schemeNextStep("double_progression", "5", PURE_BODYWEIGHT);
  assert.equal(step.kind === "step" && step.moves, "variation");
  assert.equal(step.kind === "step" && step.change, "Harder variation");
});

test("Double Progression holds a timed target, quoting it", () => {
  assert.deepEqual(schemeNextStep("double_progression", "45s", PURE_BODYWEIGHT), {
    kind: "hold",
    reason: "Double Progression needs a set rep target to step; “45s” isn’t one.",
  });
});

test("Double Progression holds a load with no single value", () => {
  assert.deepEqual(schemeNextStep("double_progression", "10", PERCENT), {
    kind: "hold",
    reason: "Double Progression needs a single load value to step.",
  });
});

test("Double Progression holds a movement with no load at all", () => {
  assert.equal(schemeNextStep("double_progression", "10", null).kind, "hold");
});

test("Greyskull checks the AMRAP floor and resets on a miss", () => {
  assert.deepEqual(schemeNextStep("greyskull", "5+", ABSOLUTE), {
    kind: "step",
    moves: "load",
    change: "+2.5 kg",
    when: "the all-out final set clears 5 reps",
    otherwise: "miss it and the load resets down 10%",
  });
});

test("Greyskull holds on pure bodyweight and on a floorless target", () => {
  assert.equal(schemeNextStep("greyskull", "5", PURE_BODYWEIGHT).kind, "hold");
  assert.equal(schemeNextStep("greyskull", "AMRAP", ABSOLUTE).kind, "hold");
});

test("Session-Count-Based steps on cadence and never steps down", () => {
  assert.deepEqual(schemeNextStep("session_count", "5", ABSOLUTE), {
    kind: "step",
    moves: "load",
    change: "+2.5 kg",
    when: "every 3rd time you train it",
    otherwise: null,
  });
  const reps = schemeNextStep("session_count", "8-12", PURE_BODYWEIGHT);
  assert.equal(reps.kind === "step" && reps.change, "+1 rep");
  assert.equal(schemeNextStep("session_count", "8", PERCENT).kind, "hold");
});

test("Static always holds", () => {
  assert.deepEqual(schemeNextStep("static", "8-12", ABSOLUTE), {
    kind: "hold",
    reason: "Static holds it as written; you set the numbers by hand.",
  });
});
