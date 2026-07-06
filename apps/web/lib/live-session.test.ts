import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initLiveSession,
  liveSessionReducer,
  progressPercent,
  currentModule,
  nextExercise,
  completionOutcome,
} from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// The Live Session engine (issue #86, F2·S1) is a pure reducer over an in-flight
// performance of a Session. `initLiveSession` expands each Exercise Prescription
// into its individual sets (pre-filled reps/load from the raw Session read); the
// reducer records completions, advances a current-set pointer, and finishes.

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

test("initLiveSession expands each prescription into one row per prescribed set", () => {
  // Arrange / Act
  const state = initLiveSession(SESSION);

  // Assert — 3 + 2 = 5 flat, position-ordered set rows, none started yet
  assert.equal(state.sessionId, 42);
  assert.equal(state.status, "not_started");
  assert.equal(state.currentIndex, 0);
  assert.equal(state.sets.length, 5);
  assert.deepEqual(
    state.sets.map((s) => s.exerciseName),
    ["Back Squat", "Back Squat", "Back Squat", "Push-up", "Push-up"],
  );
  assert.deepEqual(
    state.sets.map((s) => s.setNumber),
    [1, 2, 3, 1, 2],
  );
});

test("initLiveSession pre-fills reps and load from the prescription", () => {
  // Arrange / Act
  const state = initLiveSession(SESSION);

  // Assert — the leading rep count is pre-filled; the typed load is carried as
  // an editable kind+value, with its display text kept for the eye.
  const [firstSquat] = state.sets;
  assert.equal(firstSquat.reps, 8);
  assert.equal(firstSquat.prescribedReps, "8-12");
  assert.equal(firstSquat.loadKind, "absolute");
  assert.equal(firstSquat.loadValue, "70");
  assert.equal(firstSquat.prescribedLoadText, "70 kg");
  assert.equal(firstSquat.status, "pending");

  // A prescription with no recommended load pre-fills an empty absolute load.
  const firstPushup = state.sets[3];
  assert.equal(firstPushup.reps, 10);
  assert.equal(firstPushup.loadKind, "absolute");
  assert.equal(firstPushup.loadValue, "");
});

test("START moves a not-started session in progress", () => {
  // Arrange
  const state = initLiveSession(SESSION);

  // Act
  const started = liveSessionReducer(state, { type: "START" });

  // Assert
  assert.equal(started.status, "in_progress");
  // Immutability — the original state is untouched.
  assert.equal(state.status, "not_started");
});

test("COMPLETE_SET records the edited reps/load/RPE and marks the set complete", () => {
  // Arrange
  const state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });

  // Act — the user did 10 reps at 72.5 kg, effort 8, on the first set
  const next = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 0,
    reps: 10,
    loadKind: "absolute",
    loadValue: "72.5",
    rpe: 8,
  });

  // Assert — the edited record is captured on that row
  const set = next.sets[0];
  assert.equal(set.status, "completed");
  assert.equal(set.reps, 10);
  assert.equal(set.loadValue, "72.5");
  assert.equal(set.rpe, 8);
  // The current-set pointer moves to the next still-pending set.
  assert.equal(next.currentIndex, 1);
  // Immutability — the original row is untouched.
  assert.equal(state.sets[0].status, "pending");
});

test("completing the last set of a module advances the pointer to the next module", () => {
  // Arrange — complete all three squat sets in order
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  for (const index of [0, 1, 2]) {
    state = liveSessionReducer(state, {
      type: "COMPLETE_SET",
      index,
      reps: 8,
      loadKind: "absolute",
      loadValue: "70",
      rpe: 7,
    });
  }

  // Assert — the pointer now sits on the first push-up set (index 3, module 2)
  assert.equal(state.currentIndex, 3);
  assert.equal(state.sets[state.currentIndex].exerciseName, "Push-up");
});

test("the current-set pointer skips already-completed sets, whatever the order", () => {
  // Arrange — complete the second set first, then the first
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 1,
    reps: 8,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
  });
  // After completing index 1, the earliest pending set is still index 0.
  assert.equal(state.currentIndex, 0);

  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 0,
    reps: 8,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
  });

  // Assert — index 2 is now the earliest pending set
  assert.equal(state.currentIndex, 2);
});

test("ADVANCE skips the current set without completing it", () => {
  // Arrange
  const state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });

  // Act
  const advanced = liveSessionReducer(state, { type: "ADVANCE" });

  // Assert — pointer moved on, the skipped set stays pending (un-attempted)
  assert.equal(advanced.currentIndex, 1);
  assert.equal(advanced.sets[0].status, "pending");
});

test("ADVANCE never runs the pointer past the end", () => {
  // Arrange — a session with a single set, pointer at the last row
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });

  // Act — advance well past the 5 sets
  for (let i = 0; i < 10; i += 1) {
    state = liveSessionReducer(state, { type: "ADVANCE" });
  }

  // Assert — clamped at length (all sets behind the pointer)
  assert.equal(state.currentIndex, state.sets.length);
});

test("FINISH marks the session finished", () => {
  // Arrange
  const state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });

  // Act
  const finished = liveSessionReducer(state, { type: "FINISH" });

  // Assert
  assert.equal(finished.status, "finished");
});

// Helper: complete a specific set row with placeholder values.
function complete(state: LiveSessionState, index: number): LiveSessionState {
  return liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index,
    reps: 8,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
  });
}

test("progressPercent is attempted sets over total prescribed sets", () => {
  // Arrange — 5 prescribed sets total
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  assert.equal(progressPercent(state), 0);

  // Act — complete 1, then a 2nd, then a 3rd set
  state = complete(state, 0);
  assert.equal(progressPercent(state), 20); // 1/5

  state = complete(state, 1);
  state = complete(state, 2);

  // Assert — 3/5 = 60%
  assert.equal(progressPercent(state), 60);
});

test("progressPercent reaches 100 only when every prescribed set is attempted", () => {
  // Arrange / Act — complete all five sets
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  for (const index of [0, 1, 2, 3, 4]) state = complete(state, index);

  // Assert
  assert.equal(progressPercent(state), 100);
});

test("currentModule reports the current module as x of y", () => {
  // Arrange — pointer starts on module 1 of 2
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  assert.deepEqual(currentModule(state), { index: 1, total: 2 });

  // Act — finish the squat module (its three sets)
  state = complete(state, 0);
  state = complete(state, 1);
  state = complete(state, 2);

  // Assert — now on module 2 of 2
  assert.deepEqual(currentModule(state), { index: 2, total: 2 });
});

test("currentModule stays on the last module once all sets are done", () => {
  // Arrange / Act — everything complete, pointer parked past the end
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  for (const index of [0, 1, 2, 3, 4]) state = complete(state, index);

  // Assert — clamped to the final module, never y+1
  assert.deepEqual(currentModule(state), { index: 2, total: 2 });
});

test("completionOutcome is 'completed' only when every prescribed set is attempted", () => {
  // Arrange — attempt (complete) all five prescribed sets
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  for (const index of [0, 1, 2, 3, 4]) state = complete(state, index);

  // Act / Assert — all attempted → Completed (ADR-0013)
  assert.equal(completionOutcome(state), "completed");
});

test("completionOutcome is 'incomplete' when a set is skipped (left un-attempted)", () => {
  // Arrange — complete four sets, skip the fifth with ADVANCE (never attempted)
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  for (const index of [0, 1, 2, 3]) state = complete(state, index);
  state = liveSessionReducer(state, { type: "ADVANCE" }); // skip the last set

  // Act / Assert — one prescribed set left un-attempted → Incomplete
  assert.equal(completionOutcome(state), "incomplete");
});

test("a zero-rep completed set still counts as attempted (stays Completed)", () => {
  // Arrange — attempt every set, but grind the last one out to zero reps
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  for (const index of [0, 1, 2, 3]) state = complete(state, index);
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 4,
    reps: 0, // ground to failure — still attempted, not skipped
    loadKind: "absolute",
    loadValue: "70",
    rpe: 10,
  });

  // Act / Assert — a zero-rep *completed* set is attempted, so still Completed
  assert.equal(completionOutcome(state), "completed");
});

// Session Duration tracking (issue #88 — F2·S3). The engine stamps a start time on
// START and moves a last-activity time on each set completion, so the recorded
// duration (start → last activity) excludes the idle tail after the final set
// (ADR-0014). Timestamps are opt-in: an event without `now` leaves them untouched.

test("initLiveSession has no timestamps until the session starts", () => {
  const state = initLiveSession(SESSION);
  assert.equal(state.startedAt, null);
  assert.equal(state.lastActivityAt, null);
});

test("START stamps the start time and seeds last-activity from `now`", () => {
  // Arrange / Act
  const started = liveSessionReducer(initLiveSession(SESSION), {
    type: "START",
    now: 1_000_000,
  });

  // Assert — both the start and the first last-activity are the start instant
  assert.equal(started.startedAt, 1_000_000);
  assert.equal(started.lastActivityAt, 1_000_000);
});

test("START without a `now` leaves the timestamps unset", () => {
  // Timing is opt-in — a caller that doesn't track time still gets a valid start.
  const started = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  assert.equal(started.status, "in_progress");
  assert.equal(started.startedAt, null);
  assert.equal(started.lastActivityAt, null);
});

test("COMPLETE_SET moves last-activity to `now`, leaving the start fixed", () => {
  // Arrange
  const start = 1_000_000;
  let state = liveSessionReducer(initLiveSession(SESSION), {
    type: "START",
    now: start,
  });

  // Act — a set completed 40 s in
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 0,
    reps: 5,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
    now: start + 40_000,
  });

  // Assert — start is fixed, last-activity advanced to the completion instant
  assert.equal(state.startedAt, start);
  assert.equal(state.lastActivityAt, start + 40_000);
});

test("last-activity is the final set's completion, not the idle time after it", () => {
  // Arrange — three sets completed, each later than the last
  const start = 1_000_000;
  let state = liveSessionReducer(initLiveSession(SESSION), {
    type: "START",
    now: start,
  });
  const times = [start + 30_000, start + 90_000, start + 150_000];
  times.forEach((now, index) => {
    state = liveSessionReducer(state, {
      type: "COMPLETE_SET",
      index,
      reps: 5,
      loadKind: "absolute",
      loadValue: "70",
      rpe: 7,
      now,
    });
  });

  // Act — the user sits idle, then finishes 10 minutes later
  state = liveSessionReducer(state, { type: "FINISH", now: start + 750_000 });

  // Assert — FINISH does not touch last-activity; it stays at the final completion,
  // so the idle tail is excluded from the duration (start → last activity).
  assert.equal(state.lastActivityAt, start + 150_000);
  assert.equal(state.startedAt, start);
});

test("COMPLETE_SET without a `now` leaves last-activity where it was", () => {
  // Arrange
  const start = 1_000_000;
  let state = liveSessionReducer(initLiveSession(SESSION), {
    type: "START",
    now: start,
  });

  // Act — a completion that carries no timestamp
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 0,
    reps: 5,
    loadKind: "absolute",
    loadValue: "70",
    rpe: 7,
  });

  // Assert — last-activity is unchanged (still the start instant)
  assert.equal(state.lastActivityAt, start);
});

test("nextExercise previews the exercise of the upcoming module", () => {
  // Arrange — on the squat module, the next module is Push-up
  let state = liveSessionReducer(initLiveSession(SESSION), { type: "START" });
  assert.equal(nextExercise(state), "Push-up");

  // Act — advance into the push-up module (the last one)
  state = complete(state, 0);
  state = complete(state, 1);
  state = complete(state, 2);

  // Assert — no module after the last, so no preview
  assert.equal(nextExercise(state), null);
});
