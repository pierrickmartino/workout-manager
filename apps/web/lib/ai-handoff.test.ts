import { test } from "node:test";
import assert from "node:assert/strict";

import { aiHandoff, AI_HANDOFF_DISCLOSURE } from "./ai-handoff.ts";
import type { LoggedSession, LoggedSet } from "./logs-types.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

// The AI Hand-off (ADR-0132) turns one Logged Session into the plain text a user previews and
// sends to an outside assistant. These fixtures assert on the produced text only: what appears,
// what doesn't, in what order and with what wording.

function set(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    position: 1,
    quantity: { kind: "repetitions", text: "8", count: 8 },
    load: { kind: "absolute", text: "100 kg", kg: 100 },
    perceived_difficulty: null,
    exercise_id: 1,
    exercise_name: "Bench Press",
    body_weight_kg: null,
    ...overrides,
  };
}

// A plan prescribing the given exercises, one Exercise Prescription per id.
function plan(exerciseIds: number[]): { prescriptions: ExercisePrescription[] } {
  return {
    prescriptions: exerciseIds.map((exerciseId, index) => ({
      position: index + 1,
      sets: 3,
      reps: "8",
      rest_seconds: null,
      tempo: null,
      recommended_load: null,
      exercise_id: exerciseId,
      exercise_name: `Exercise ${exerciseId}`,
      exercise_description: null,
      targeted_muscles: [],
      required_equipment: [],
      provenance: "generated",
    })),
  };
}

function record(overrides: Partial<LoggedSession>): LoggedSession {
  return {
    id: 7,
    clerk_user_id: "u1",
    session_id: null,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: null,
    duration_seconds: null,
    logged_sets: [],
    ...overrides,
  };
}

test("a plan-less strength session hands off as a lead-in, a session line and a Performed block", () => {
  // Arrange
  const session = record({
    duration_seconds: 52 * 60 + 10,
    logged_sets: [
      set({ position: 1, exercise_name: "Bench Press", set_type: "warm_up",
        quantity: { kind: "repetitions", text: "10", count: 10 },
        load: { kind: "absolute", text: "40 kg", kg: 40 } }),
      set({ position: 2, exercise_name: "Bench Press", effort: { scale: "rpe", value: 8 } }),
      set({ position: 3, exercise_id: 2, exercise_name: "Barbell Row",
        quantity: { kind: "repetitions", text: "10", count: 10 },
        load: { kind: "absolute", text: "60 kg", kg: 60 }, note: "grip slipped" }),
    ],
  });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg" });

  // Assert
  assert.equal(
    handoff.text,
    [
      "Please critique this workout. Tell me what went well, what I should change next time, and anything that looks risky.",
      "",
      "Session: strength training, 52 minutes.",
      "",
      "Performed:",
      "Bench Press",
      "- Set 1 (warm-up): 10 reps @ 40 kg",
      "- Set 2: 8 reps @ 100 kg, RPE 8",
      "Barbell Row",
      "- Set 1: 10 reps @ 60 kg. Note: “grip slipped”",
    ].join("\n"),
  );
  assert.equal(handoff.showSensitiveCaveat, false);
});

test("the disclosure says the text leaves the app and is handled under the receiving app’s terms", () => {
  assert.match(AI_HANDOFF_DISCLOSURE, /leaves Workout Manager/);
  assert.match(AI_HANDOFF_DISCLOSURE, /its own terms/);
});

test("a completed session says it was finished in full", () => {
  const handoff = aiHandoff({
    record: record({ completion_outcome: "completed", logged_sets: [set({})] }),
    unit: "kg",
  });

  assert.match(handoff.text, /^Session: strength training\. Finished the whole session\.$/m);
});

test("a partial session says how many of the planned exercises were done", () => {
  // Arrange — 2 of the plan's 5 exercises performed
  const session = record({
    session_id: 42,
    completion_outcome: "incomplete",
    duration_seconds: 65 * 60,
    logged_sets: [
      set({ position: 1, exercise_id: 1 }),
      set({ position: 2, exercise_id: 1 }),
      set({ position: 3, exercise_id: 2, exercise_name: "Squat" }),
    ],
  });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg", plan: plan([1, 2, 3, 4, 5]) });

  // Assert
  assert.match(
    handoff.text,
    /^Session: strength training, 1 hour 5 minutes\. Ended early: 2 of 5 exercises done\.$/m,
  );
});

test("a partial session without a readable plan still says it ended early", () => {
  const handoff = aiHandoff({
    record: record({ session_id: 42, completion_outcome: "incomplete", logged_sets: [set({})] }),
    unit: "kg",
  });

  assert.match(handoff.text, /Ended early: 1 exercise done\./);
});

test("a session with no declared outcome states none", () => {
  const handoff = aiHandoff({ record: record({ logged_sets: [set({})] }), unit: "kg" });

  assert.match(handoff.text, /^Session: strength training\.$/m);
  assert.doesNotMatch(handoff.text, /Ended early|Finished/);
});

test("the text never contains the exact date", () => {
  const handoff = aiHandoff({
    record: record({ performed_on: "2026-06-20", logged_sets: [set({})] }),
    unit: "kg",
  });

  assert.doesNotMatch(handoff.text, /2026|06-20|June/);
});

test("Loads read in the user’s Weight Unit", () => {
  const handoff = aiHandoff({
    record: record({ logged_sets: [set({ load: { kind: "absolute", text: "100 kg", kg: 100 } })] }),
    unit: "lb",
  });

  assert.match(handoff.text, /- Set 1: 8 reps @ 220\.46 lb$/m);
});

test("body weight appears only beside a bodyweight Load", () => {
  // Arrange — the same performer weight snapshotted on a loaded set and a bodyweight set
  const session = record({
    logged_sets: [
      set({ position: 1, body_weight_kg: 80 }),
      set({
        position: 2,
        exercise_id: 2,
        exercise_name: "Pull-up",
        body_weight_kg: 80,
        load: { kind: "bodyweight", text: "bodyweight + 10 kg", added_kg: 10 },
      }),
    ],
  });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg" });

  // Assert
  assert.match(handoff.text, /^- Set 1: 8 reps @ 100 kg$/m);
  assert.match(handoff.text, /^- Set 1: 8 reps @ bodyweight \+ 10 kg, body weight 80 kg$/m);
});

test("Effort logged as reps in reserve reads in plain words", () => {
  const handoff = aiHandoff({
    record: record({ logged_sets: [set({ effort: { scale: "rir", value: 2 } })] }),
    unit: "kg",
  });

  assert.match(handoff.text, /8 reps @ 100 kg, 2 reps in reserve$/m);
});

test("an exercise revisited later in the session keeps its sets together, in performed order", () => {
  // Arrange — a superset: bench, row, bench, row (positions out of array order)
  const session = record({
    logged_sets: [
      set({ position: 3, exercise_id: 1, quantity: { kind: "repetitions", text: "6", count: 6 } }),
      set({ position: 1, exercise_id: 1 }),
      set({ position: 2, exercise_id: 2, exercise_name: "Barbell Row" }),
      set({ position: 4, exercise_id: 2, exercise_name: "Barbell Row" }),
    ],
  });

  // Act
  const performed = aiHandoff({ record: session, unit: "kg" }).text.split("Performed:\n")[1];

  // Assert
  assert.equal(
    performed,
    [
      "Bench Press",
      "- Set 1: 8 reps @ 100 kg",
      "- Set 2: 6 reps @ 100 kg",
      "Barbell Row",
      "- Set 1: 8 reps @ 100 kg",
      "- Set 2: 8 reps @ 100 kg",
    ].join("\n"),
  );
});

test("a stored Set Note is decoded and a blank one is left out", () => {
  const handoff = aiHandoff({
    record: record({
      logged_sets: [
        set({ position: 1, note: "knee &amp; hip felt tight" }),
        set({ position: 2, note: "   " }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: 8 reps @ 100 kg\. Note: “knee & hip felt tight”$/m);
  assert.match(handoff.text, /^- Set 2: 8 reps @ 100 kg$/m);
});

test("building the hand-off does not mutate the record", () => {
  // Arrange
  const session = record({
    logged_sets: [set({ position: 2 }), set({ position: 1, exercise_id: 2 })],
  });
  const sourcePlan = plan([3, 1, 2]);
  const before = structuredClone({ session, sourcePlan });

  // Act
  aiHandoff({ record: session, unit: "lb", plan: sourcePlan });

  // Assert
  assert.deepEqual({ session, sourcePlan }, before);
});

test("an ended-early count only credits exercises the plan prescribed", () => {
  // Arrange — the plan prescribes 1..5; 1 and 2 were done, plus an off-plan substitute (9)
  const session = record({
    session_id: 42,
    completion_outcome: "incomplete",
    logged_sets: [
      set({ position: 1, exercise_id: 1 }),
      set({ position: 2, exercise_id: 2, exercise_name: "Squat" }),
      set({ position: 3, exercise_id: 9, exercise_name: "Goblet Squat" }),
    ],
  });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg", plan: plan([1, 2, 3, 4, 5]) });

  // Assert
  assert.match(handoff.text, /Ended early: 2 of 5 exercises done\./);
});

test("every non-working set type is marked in plain words", () => {
  const handoff = aiHandoff({
    record: record({
      logged_sets: [
        set({ position: 1, set_type: "drop" }),
        set({ position: 2, set_type: "failure" }),
        set({ position: 3, set_type: "amrap" }),
        set({ position: 4, set_type: "working" }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1 \(drop set\): /m);
  assert.match(handoff.text, /^- Set 2 \(to failure\): /m);
  assert.match(handoff.text, /^- Set 3 \(as many reps as possible\): /m);
  assert.match(handoff.text, /^- Set 4: /m);
});

test("short and whole-hour durations read in words", () => {
  const short = aiHandoff({ record: record({ duration_seconds: 20 }), unit: "kg" });
  const hour = aiHandoff({ record: record({ duration_seconds: 2 * 3600 }), unit: "kg" });

  assert.match(short.text, /^Session: strength training, under a minute\.$/m);
  assert.match(hour.text, /^Session: strength training, 2 hours\.$/m);
});

test("a set with neither amount nor Load says nothing was recorded", () => {
  const handoff = aiHandoff({
    record: record({ logged_sets: [set({ quantity: null, load: null })] }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: nothing recorded$/m);
});
