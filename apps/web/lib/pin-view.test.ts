import { test } from "node:test";
import assert from "node:assert/strict";

import { displayReps, pinControlModel } from "./pin-view.ts";
import type { ExercisePrescription } from "./sessions-types.ts";
import type { Load } from "./load.ts";

// `pin-view` decides what the Session/plan view shows for one prescription's rep target and pin
// controls (ADR-0053, #371): a Pinned Target is surfaced verbatim with an un-pin control; a
// pure-bodyweight un-pinned movement offers a Pin control pre-filled with an editable default;
// everything else offers no rep-pin control. These tests pin the three states and the display.

const BODYWEIGHT: Load = { kind: "bodyweight", text: "Bodyweight" };
const WEIGHTED_BODYWEIGHT: Load = { kind: "bodyweight", text: "+10kg", added_kg: 10 };
const ABSOLUTE: Load = { kind: "absolute", text: "60kg", kg: 60 };

function prescription(
  overrides: Partial<ExercisePrescription>,
): ExercisePrescription {
  return {
    position: 0,
    sets: 3,
    reps: "8-12",
    rest_seconds: null,
    tempo: null,
    recommended_load: BODYWEIGHT,
    exercise_id: 1,
    exercise_name: "Pull-up",
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "ai_generated",
    ...overrides,
  };
}

test("a pinned movement surfaces the pinned range and offers un-pin", () => {
  const model = pinControlModel(prescription({ pinned_reps: "13-15" }));
  assert.deepEqual(model, { kind: "pinned", reps: "13-15" });
});

test("displayReps shows the Pinned Target when set, else the prescribed reps", () => {
  assert.equal(displayReps(prescription({ reps: "8-12", pinned_reps: "13-15" })), "13-15");
  assert.equal(displayReps(prescription({ reps: "8-12", pinned_reps: null })), "8-12");
  // A blank pinned marker is treated as un-pinned, not an empty target
  assert.equal(displayReps(prescription({ reps: "8-12", pinned_reps: "  " })), "8-12");
});

test("a pure-bodyweight, un-pinned movement is pinnable with an editable default range", () => {
  const model = pinControlModel(prescription({ reps: "8-12", pinned_reps: null }));
  assert.deepEqual(model, { kind: "pinnable", defaultReps: "8-12" });
});

test("a pinnable single-number target seeds the default as a single number", () => {
  const model = pinControlModel(prescription({ reps: "5", pinned_reps: null }));
  assert.deepEqual(model, { kind: "pinnable", defaultReps: "5" });
});

test("a pinnable movement with free-text reps seeds a blank editable default", () => {
  const model = pinControlModel(prescription({ reps: "AMRAP", pinned_reps: null }));
  assert.deepEqual(model, { kind: "pinnable", defaultReps: "" });
});

test("a loaded or weighted-bodyweight movement offers no rep-pin control", () => {
  assert.deepEqual(pinControlModel(prescription({ recommended_load: ABSOLUTE })), {
    kind: "none",
  });
  assert.deepEqual(
    pinControlModel(prescription({ recommended_load: WEIGHTED_BODYWEIGHT })),
    { kind: "none" },
  );
  assert.deepEqual(pinControlModel(prescription({ recommended_load: null })), {
    kind: "none",
  });
});

test("a Pinned Target wins even on a movement that would not otherwise be pinnable", () => {
  // Defensive: the marker's presence is authoritative — a stored pin is always un-pinnable
  const model = pinControlModel(
    prescription({ recommended_load: ABSOLUTE, pinned_reps: "10-14" }),
  );
  assert.deepEqual(model, { kind: "pinned", reps: "10-14" });
});
