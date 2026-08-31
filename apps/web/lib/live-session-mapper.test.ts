import { test } from "node:test";
import assert from "node:assert/strict";

import { initLiveSession, liveSessionReducer } from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import { mapFinishToLog } from "./live-session-mapper.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// The finish→payload mapper turns a finished Live Session into the request the
// existing log endpoint accepts (issue #86): one Logged Set per *completed* set,
// reps/load/RPE preserved, and nothing at all when no set was completed.

const SESSION: WorkoutSession = {
  id: 42,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 3,
      reps: "5",
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

function complete(
  state: LiveSessionState,
  index: number,
  reps: number,
  loadValue: string,
  rpe: number | null,
): LiveSessionState {
  return liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index,
    reps,
    loadKind: "absolute",
    loadValue,
    rpe,
  });
}

test("maps every completed set to a Logged Set, preserving reps/load/RPE", () => {
  // Arrange — complete two of the three squat sets with distinct records
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  state = complete(state, 0, 5, "70", 7);
  state = complete(state, 1, 4, "72.5", 9);
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — two Logged Sets for the same exercise, in order
  assert.ok(payload);
  assert.equal(payload.performed_on, "2026-07-06");
  assert.equal(payload.logged_sets.length, 2);
  assert.deepEqual(payload.logged_sets[0], {
    exercise_id: 100,
    quantity_kind: "repetitions",
    quantity_value: "5",
    load_kind: "absolute",
    load_value: "70",
    perceived_difficulty: 7,
  });
  assert.deepEqual(payload.logged_sets[1], {
    exercise_id: 100,
    quantity_kind: "repetitions",
    quantity_value: "4",
    load_kind: "absolute",
    load_value: "72.5",
    perceived_difficulty: 9,
  });
});

test("produces N Logged Sets per exercise from N completed sets", () => {
  // Arrange — complete all three squat sets and both push-up sets
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  for (const index of [0, 1, 2, 3, 4]) state = complete(state, index, 6, "70", 7);
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — three entries for the squat, two for the push-up (flat, ordered)
  assert.ok(payload);
  assert.deepEqual(
    payload.logged_sets.map((set) => set.exercise_id),
    [100, 100, 100, 200, 200],
  );
});

test("sends 'completed' when every prescribed set was attempted", () => {
  // Arrange — complete all five prescribed sets
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  for (const index of [0, 1, 2, 3, 4]) state = complete(state, index, 5, "70", 7);
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — the mapper carries the derived Completion Outcome (ADR-0013)
  assert.ok(payload);
  assert.equal(payload.completion_outcome, "completed");
});

test("sends 'incomplete' when a prescribed set was left un-attempted", () => {
  // Arrange — complete only some sets, leaving the rest un-attempted
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  state = complete(state, 0, 5, "70", 7);
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — a partial performance is declared Incomplete
  assert.ok(payload);
  assert.equal(payload.completion_outcome, "incomplete");
});

test("only completed sets are logged — skipped/pending sets are dropped", () => {
  // Arrange — complete just the first set, leave the rest un-attempted
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  state = complete(state, 0, 5, "70", 7);
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — exactly one Logged Set
  assert.ok(payload);
  assert.equal(payload.logged_sets.length, 1);
  assert.equal(payload.logged_sets[0].exercise_id, 100);
});

test("an empty load value maps to a null load, not the empty string", () => {
  // Arrange — complete a push-up set (no prescribed load) without entering one
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 3,
    reps: 12,
    loadKind: "absolute",
    loadValue: "",
    rpe: null,
  });
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — the backend reads null as "no load recorded"
  assert.ok(payload);
  assert.equal(payload.logged_sets[0].load_value, null);
  assert.equal(payload.logged_sets[0].perceived_difficulty, null);
});

test("records the Session Duration as start → last activity, excluding the idle tail", () => {
  // Arrange — a timed START, two sets completed, then an idle gap before FINISH
  const start = 1_000_000;
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), {
    type: "START",
    now: start,
  });
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 0,
    reps: 5,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
    now: start + 60_000,
  });
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 1,
    reps: 5,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
    now: start + 300_000, // last activity at 5 minutes
  });
  // Sit idle, then finish 10 minutes after the last set.
  state = liveSessionReducer(state, { type: "FINISH", now: start + 900_000 });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — duration is start → last activity (300 s), not the wall-clock to finish
  assert.ok(payload);
  assert.equal(payload.duration_seconds, 300);
});

test("records no duration for an untracked session (the static-form case)", () => {
  // Arrange — completions dispatched without any `now` timestamps
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  state = complete(state, 0, 5, "70", 7);
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — with no start/activity captured, the recorded duration is null
  assert.ok(payload);
  assert.equal(payload.duration_seconds, null);
});

test("finishing with zero completed sets writes nothing (null payload)", () => {
  // Arrange — start and finish without completing any set
  let state = liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
  state = liveSessionReducer(state, { type: "FINISH" });

  // Act
  const payload = mapFinishToLog(state, "2026-07-06", "kg");

  // Assert — no submission at all
  assert.equal(payload, null);
});
