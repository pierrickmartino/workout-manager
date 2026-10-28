import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_WARM_UP_ADD_LOCKED_NOTE,
  LIVE_WARM_UP_KEPT_NOTE,
  afterLiveWarmUpAdded,
  liveWarmUpAddLockedNote,
  liveWarmUpButtonView,
} from "./live-warm-up.ts";
import { initLiveSession, liveSessionReducer, type LiveSessionState } from "./live-session.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";

// The Live Session's Warm-up Suggestion (ADR-0144, #783): when the button shows at the start of
// a Live Session, when Add is allowed, and whether a saved warm-up reloads the Live Session.

function prescription(
  exerciseName: string,
  overrides: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return {
    position: 0,
    sets: 2,
    reps: "8",
    rest_seconds: 90,
    tempo: null,
    recommended_load: null,
    exercise_id: 1,
    exercise_name: exerciseName,
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "curated",
    ...overrides,
  };
}

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 7,
    clerk_user_id: "user_a",
    training_type: "strength",
    duration_minutes: 45,
    has_been_regenerated: false,
    prescriptions: [prescription("Back Squat")],
    ...overrides,
  };
}

const WITH_WARM_UP = session({
  prescriptions: [
    prescription("Glute Bridge", { sets: 1, set_type: "warm_up", exercise_id: 11 }),
    prescription("Back Squat", { position: 1 }),
  ],
});

function live(source: WorkoutSession): LiveSessionState {
  return liveSessionReducer(initLiveSession(source, "kg"), { type: "START", now: 1_000 });
}

function complete(state: LiveSessionState, index: number): LiveSessionState {
  return liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index,
    reps: 8,
    loadKind: "bodyweight",
    loadValue: "",
    rpe: null,
    now: 2_000,
  });
}

test("offers the warm-up button at the start of a Live Session", () => {
  const view = liveWarmUpButtonView(session(), live(session()), true);

  assert.equal(view.visible, true);
  assert.equal(view.label, "Warm-up");
  assert.equal(view.disabled, false);
});

test("hides the button once the first working set is completed", () => {
  const state = complete(live(session()), 0);

  assert.equal(liveWarmUpButtonView(session(), state, true).visible, false);
});

test("keeps the button while only warm-up sets are completed, offering Replace", () => {
  const state = complete(live(WITH_WARM_UP), 0);

  const view = liveWarmUpButtonView(WITH_WARM_UP, state, true);

  assert.equal(view.visible, true);
  assert.equal(view.label, "Replace warm-up");
});

test("disables the button offline with an explanation", () => {
  const view = liveWarmUpButtonView(session(), live(session()), false);

  assert.equal(view.visible, true);
  assert.equal(view.disabled, true);
  assert.match(view.offlineNote ?? "", /offline/i);
});

test("allows Add while no set has been completed", () => {
  assert.equal(liveWarmUpAddLockedNote(live(WITH_WARM_UP)), null);
});

test("locks Add, with an explanation, once any set is completed — even a warm-up one", () => {
  const state = complete(live(WITH_WARM_UP), 0);

  assert.equal(liveWarmUpAddLockedNote(state), LIVE_WARM_UP_ADD_LOCKED_NOTE);
});

test("a saved warm-up reloads the Live Session while nothing has been completed", () => {
  assert.deepEqual(afterLiveWarmUpAdded(live(session())), { kind: "reload" });
});

test("a saved warm-up keeps the running Live Session if a set was completed meanwhile", () => {
  const state = complete(live(session()), 0);

  assert.deepEqual(afterLiveWarmUpAdded(state), {
    kind: "keep",
    note: LIVE_WARM_UP_KEPT_NOTE,
  });
});

test("the reloaded Live Session starts at the first warm-up drill, typed warm-up", () => {
  const reloaded = live(WITH_WARM_UP);

  assert.equal(reloaded.currentIndex, 0);
  assert.equal(reloaded.sets[0].exerciseName, "Glute Bridge");
  assert.equal(reloaded.sets[0].setType, "warm_up");
  assert.equal(reloaded.sets[1].setType, "working");
});

test("the reloaded Live Session carries no constraint detail into the storage slot", () => {
  const withCaveat = {
    ...WITH_WARM_UP,
    caveat: { applies: true, message: "Knee injury — not tailored to you" },
    objective: "Rehab after knee surgery",
  };

  const slot = JSON.stringify(live(withCaveat));

  assert.doesNotMatch(slot, /knee/i);
});
