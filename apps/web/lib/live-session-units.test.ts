import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initLiveSession,
  liveSessionReducer,
  groupUnits,
  onDeckExercise,
  liveSetDomId,
  type LiveSessionState,
} from "./live-session.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// Unit grouping + on-deck derivations for the always-on-timer live UI (F2 refinement).
// The flat set list is grouped back into *units* — a solo Prescription's sets, or a
// whole Superset (ADR-0023) — so the screen can collapse a fully-completed unit to a
// one-line summary while the current and upcoming units stay expanded. On-deck names
// the exercise the current-set pointer sits on (the sticky "Next up" jump target).

// Solo Session: Back Squat ×3, Push-up ×2 → two solo units.
const SOLO: WorkoutSession = {
  id: 42,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 3,
      reps: "8-12",
      rest_seconds: 90,
      tempo: null,
      recommended_load: { kind: "absolute", text: "70 kg", kg: 70 },
      exercise_id: 100,
      exercise_name: "Back Squat",
      exercise_description: null,
      targeted_muscles: ["quads"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
    {
      position: 2,
      sets: 2,
      reps: "10",
      rest_seconds: 60,
      tempo: null,
      recommended_load: null,
      exercise_id: 200,
      exercise_name: "Push-up",
      exercise_description: null,
      targeted_muscles: ["chest"],
      required_equipment: [],
      provenance: "curated",
    },
  ],
};

// A Superset "1" of Bench Press + Barbell Row (three rounds), then a solo Plank ×2.
const GROUPED: WorkoutSession = {
  id: 7,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 3,
      reps: "8",
      rest_seconds: 90,
      tempo: null,
      recommended_load: { kind: "absolute", text: "60 kg", kg: 60 },
      superset_group: "1",
      round_rest_seconds: 120,
      exercise_id: 100,
      exercise_name: "Bench Press",
      exercise_description: null,
      targeted_muscles: ["chest"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
    {
      position: 2,
      sets: 3,
      reps: "10",
      rest_seconds: 60,
      tempo: null,
      recommended_load: { kind: "absolute", text: "50 kg", kg: 50 },
      superset_group: "1",
      round_rest_seconds: 120,
      exercise_id: 200,
      exercise_name: "Barbell Row",
      exercise_description: null,
      targeted_muscles: ["back"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
    {
      position: 3,
      sets: 2,
      reps: "12",
      rest_seconds: 45,
      tempo: null,
      recommended_load: null,
      superset_group: null,
      round_rest_seconds: null,
      exercise_id: 300,
      exercise_name: "Plank",
      exercise_description: null,
      targeted_muscles: ["core"],
      required_equipment: [],
      provenance: "curated",
    },
  ],
};

// Complete the set at `index` with placeholder values.
function complete(state: LiveSessionState, index: number): LiveSessionState {
  return liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index,
    reps: 8,
    loadKind: "absolute",
    loadValue: "60",
    rpe: 7,
  });
}

test("groupUnits partitions a solo Session into one unit per Prescription", () => {
  // Arrange / Act
  const units = groupUnits(initLiveSession(SOLO));

  // Assert — two solo units, in order, each carrying all of its own sets.
  assert.equal(units.length, 2);
  assert.equal(units[0].supersetLabel, null);
  assert.deepEqual(units[0].exerciseNames, ["Back Squat"]);
  assert.equal(units[0].sets.length, 3);
  assert.deepEqual(units[1].exerciseNames, ["Push-up"]);
  assert.equal(units[1].sets.length, 2);
});

test("groupUnits carries each set's absolute index into state.sets", () => {
  // Arrange / Act — the screen dispatches COMPLETE_SET by absolute index, so the
  // grouped view must preserve it.
  const units = groupUnits(initLiveSession(SOLO));

  // Assert
  assert.deepEqual(
    units[0].sets.map((s) => s.index),
    [0, 1, 2],
  );
  assert.deepEqual(
    units[1].sets.map((s) => s.index),
    [3, 4],
  );
});

test("groupUnits marks the unit holding the current-set pointer", () => {
  // Arrange — pointer starts on the first set (unit 0).
  const state = initLiveSession(SOLO);

  // Act
  const units = groupUnits(state);

  // Assert
  assert.equal(units[0].containsCurrent, true);
  assert.equal(units[1].containsCurrent, false);
});

test("groupUnits flips a unit to complete once all its sets are attempted", () => {
  // Arrange — attempt all three Back Squat sets; the pointer moves into Push-up.
  let state = initLiveSession(SOLO);
  state = complete(state, 0);
  state = complete(state, 1);
  state = complete(state, 2);

  // Act
  const units = groupUnits(state);

  // Assert — unit 0 is complete and no longer current; unit 1 is now current.
  assert.equal(units[0].isComplete, true);
  assert.equal(units[0].containsCurrent, false);
  assert.equal(units[1].isComplete, false);
  assert.equal(units[1].containsCurrent, true);
});

test("groupUnits keeps a unit with a skipped (still-pending) set incomplete", () => {
  // Arrange — skip the first set (ADVANCE leaves it pending), complete the rest.
  let state = initLiveSession(SOLO);
  state = liveSessionReducer(state, { type: "ADVANCE" }); // skip set 0
  state = complete(state, 1);
  state = complete(state, 2);

  // Act
  const units = groupUnits(state);

  // Assert — a left-behind pending set keeps the unit expanded, never collapsed.
  assert.equal(units[0].isComplete, false);
});

test("groupUnits summarizes a solo unit as its name and set count", () => {
  // Arrange / Act
  const units = groupUnits(initLiveSession(SOLO));

  // Assert
  assert.equal(units[0].summary, "Back Squat — 3 sets");
  assert.equal(units[1].summary, "Push-up — 2 sets");
});

test("groupUnits summary uses the singular for a one-set unit", () => {
  // Arrange — a Session whose single Prescription prescribes one set.
  const single: WorkoutSession = {
    ...SOLO,
    prescriptions: [{ ...SOLO.prescriptions[0], sets: 1 }],
  };

  // Act
  const units = groupUnits(initLiveSession(single));

  // Assert
  assert.equal(units[0].summary, "Back Squat — 1 set");
});

test("groupUnits collapses a whole Superset into one unit", () => {
  // Arrange / Act — Bench+Row interleave as ONE unit, then the solo Plank.
  const units = groupUnits(initLiveSession(GROUPED));

  // Assert
  assert.equal(units.length, 2);
  assert.equal(units[0].supersetLabel, "A");
  assert.deepEqual(units[0].exerciseNames, ["Bench Press", "Barbell Row"]);
  assert.equal(units[0].sets.length, 6); // 2 members × 3 rounds
  assert.equal(units[1].supersetLabel, null);
  assert.deepEqual(units[1].exerciseNames, ["Plank"]);
});

test("groupUnits summarizes a Superset by label, members, and round count", () => {
  // Arrange / Act
  const units = groupUnits(initLiveSession(GROUPED));

  // Assert
  assert.equal(units[0].summary, "Superset A · Bench Press + Barbell Row — 3 rounds");
});

test("onDeckExercise names the exercise the pointer currently sits on", () => {
  // Arrange
  const state = initLiveSession(SOLO);

  // Act / Assert — first set on deck.
  assert.equal(onDeckExercise(state), "Back Squat");

  // Act / Assert — after all Back Squat sets, Push-up is on deck.
  let advanced = complete(state, 0);
  advanced = complete(advanced, 1);
  advanced = complete(advanced, 2);
  assert.equal(onDeckExercise(advanced), "Push-up");
});

test("onDeckExercise is null once every set has been attempted", () => {
  // Arrange — complete all five sets; the pointer runs off the end.
  let state = initLiveSession(SOLO);
  for (let index = 0; index < 5; index += 1) state = complete(state, index);

  // Act / Assert — nothing is on deck; the sticky bar drops "Next up".
  assert.equal(onDeckExercise(state), null);
});

test("liveSetDomId is stable and unique per set row", () => {
  // Arrange
  const state = initLiveSession(GROUPED);

  // Act — every row's id is unique across the interleaved Superset + solo tail.
  const ids = state.sets.map(liveSetDomId);

  // Assert
  assert.equal(new Set(ids).size, ids.length);
});
