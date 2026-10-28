import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WARM_UP_ADD_FALLBACK_ERROR,
  WARM_UP_FALLBACK_ERROR,
  initialWarmUpState,
  toAddWarmUpResult,
  toWarmUpResult,
  warmUpAddLabel,
  warmUpButtonView,
  warmUpPreview,
  warmUpReducer,
  type WarmUpSuggestion,
} from "./warm-up-suggestion.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";

// The Warm-up Suggestion view-model (ADR-0143, #778): when the Session preview offers the
// warm-up button and what it reads, the request lifecycle (loading → preview → discard /
// regenerate, or error → retry), and how each drill renders as a preview row.

function prescription(
  exerciseName: string,
  overrides: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return {
    position: 0,
    sets: 3,
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
    prescriptions: [prescription("Back Squat"), prescription("Romanian Deadlift")],
    logged_count: 0,
    ...overrides,
  };
}

const SUGGESTION: WarmUpSuggestion = {
  drills: [
    {
      exercise_id: 11,
      exercise_name: "Glute Bridge",
      sets: 1,
      reps: "10",
      prescribed_quantity: { kind: "repetitions", text: "10", count: 10 },
      recommended_load: { kind: "bodyweight", text: "bodyweight" },
      rest_seconds: 10,
      set_type: "warm_up",
    },
    {
      exercise_id: 12,
      exercise_name: "Side Plank",
      sets: 1,
      reps: "30s",
      prescribed_quantity: { kind: "duration", text: "30s", seconds: 30 },
      recommended_load: { kind: "qualitative", text: "light band" },
      rest_seconds: 0,
      set_type: "warm_up",
    },
  ],
  estimated_minutes: 6,
  has_warm_up_section: false,
};

test("offers the warm-up button on an un-performed Session", () => {
  const view = warmUpButtonView(session(), true);

  assert.deepEqual(view, {
    visible: true,
    label: "Warm-up",
    disabled: false,
    offlineNote: null,
  });
});

test("hides the button once the Session has been performed", () => {
  const view = warmUpButtonView(session({ logged_count: 2 }), true);

  assert.equal(view.visible, false);
});

test("reads Replace warm-up when the Session already opens with a Warm-up Section", () => {
  const opensWithWarmUp = session({
    prescriptions: [
      prescription("Goblet Squat", { set_type: "warm_up" }),
      prescription("Back Squat"),
    ],
  });

  assert.equal(warmUpButtonView(opensWithWarmUp, true).label, "Replace warm-up");
});

test("a warm-up set later in the Session is not a leading Warm-up Section", () => {
  const trailing = session({
    prescriptions: [
      prescription("Back Squat"),
      prescription("Goblet Squat", { set_type: "warm_up" }),
    ],
  });

  assert.equal(warmUpButtonView(trailing, true).label, "Warm-up");
});

test("disables the button offline with an explanation", () => {
  const view = warmUpButtonView(session(), false);

  assert.equal(view.visible, true);
  assert.equal(view.disabled, true);
  assert.equal(view.offlineNote, "Offline — reconnect to get a warm-up");
});

test("a request shows the loading state and remembers whether it regenerates", () => {
  const loading = warmUpReducer(initialWarmUpState, { type: "requested", regenerate: false });

  assert.deepEqual(loading, { status: "loading", regenerate: false });
});

test("a successful response shows the preview", () => {
  const loading = warmUpReducer(initialWarmUpState, { type: "requested", regenerate: false });

  const ready = warmUpReducer(loading, { type: "succeeded", suggestion: SUGGESTION });

  assert.deepEqual(ready, { status: "ready", suggestion: SUGGESTION });
});

test("discard returns to the idle button, leaving nothing behind", () => {
  const ready = warmUpReducer(
    { status: "loading", regenerate: false },
    { type: "succeeded", suggestion: SUGGESTION },
  );

  assert.deepEqual(warmUpReducer(ready, { type: "discarded" }), initialWarmUpState);
});

test("a failed request keeps the message and what retry should ask for", () => {
  const regenerating = warmUpReducer(
    { status: "ready", suggestion: SUGGESTION },
    { type: "requested", regenerate: true },
  );

  const failed = warmUpReducer(regenerating, { type: "failed", message: "Try again." });

  assert.deepEqual(failed, { status: "error", message: "Try again.", regenerate: true });
});

test("maps a successful envelope to the suggestion", () => {
  const result = toWarmUpResult({ success: true, data: SUGGESTION, error: null });

  assert.deepEqual(result, { ok: true, suggestion: SUGGESTION });
});

test("maps a failed envelope to its message, or a fallback when it has none", () => {
  assert.deepEqual(
    toWarmUpResult({ success: false, data: null, error: "No warm-up could be suggested." }),
    { ok: false, message: "No warm-up could be suggested." },
  );
  assert.deepEqual(toWarmUpResult({ success: false, data: null, error: null }), {
    ok: false,
    message: WARM_UP_FALLBACK_ERROR,
  });
});

test("adding keeps the preview on screen while the drills are saved", () => {
  const ready = warmUpReducer(initialWarmUpState, { type: "succeeded", suggestion: SUGGESTION });

  const adding = warmUpReducer(ready, { type: "addRequested" });

  assert.deepEqual(adding, { status: "adding", suggestion: SUGGESTION });
  assert.equal(warmUpAddLabel(adding), "Adding…");
});

test("a saved warm-up returns to the idle button, as the refreshed Session now shows it", () => {
  const adding = warmUpReducer(
    { status: "ready", suggestion: SUGGESTION },
    { type: "addRequested" },
  );

  assert.deepEqual(warmUpReducer(adding, { type: "added" }), initialWarmUpState);
});

test("a failed add keeps the preview with its message and offers retry", () => {
  const adding = warmUpReducer(
    { status: "ready", suggestion: SUGGESTION },
    { type: "addRequested" },
  );

  const failed = warmUpReducer(adding, { type: "addFailed", message: "Try again." });

  assert.deepEqual(failed, { status: "addError", suggestion: SUGGESTION, message: "Try again." });
  assert.equal(warmUpAddLabel(failed), "Retry add");
  assert.deepEqual(warmUpReducer(failed, { type: "addRequested" }), {
    status: "adding",
    suggestion: SUGGESTION,
  });
});

test("the preview offers Add before anything is tried", () => {
  assert.equal(warmUpAddLabel({ status: "ready", suggestion: SUGGESTION }), "Add");
});

test("an add requested with no preview on screen changes nothing", () => {
  assert.deepEqual(warmUpReducer(initialWarmUpState, { type: "addRequested" }), initialWarmUpState);
});

test("discarding a failed add leaves nothing behind", () => {
  const failed = { status: "addError", suggestion: SUGGESTION, message: "x" } as const;

  assert.deepEqual(warmUpReducer(failed, { type: "discarded" }), initialWarmUpState);
});

test("maps the add envelope to success, or its message with a fallback", () => {
  assert.deepEqual(toAddWarmUpResult({ success: true, error: null }), { ok: true });
  assert.deepEqual(toAddWarmUpResult({ success: false, error: "Already trained." }), {
    ok: false,
    message: "Already trained.",
  });
  assert.deepEqual(toAddWarmUpResult({ success: false, error: null }), {
    ok: false,
    message: WARM_UP_ADD_FALLBACK_ERROR,
  });
});

test("previews each drill with its name, reps or seconds, and Load label", () => {
  const preview = warmUpPreview(SUGGESTION, "kg");

  assert.equal(preview.summary, "2 drills · about 6 min");
  assert.deepEqual(preview.rows, [
    { key: "0-11", name: "Glute Bridge", amount: "10 reps", load: "bodyweight" },
    { key: "1-12", name: "Side Plank", amount: "30 s", load: "light band" },
  ]);
});
