import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aiHandoff,
  AI_HANDOFF_DISCLOSURE,
  AI_HANDOFF_SENSITIVE_CAVEAT,
} from "./ai-handoff.ts";
import type { LoggedSession, LoggedSet } from "./logs-types.ts";
import type { Profile } from "./profile-types.ts";
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
  const handoff = aiHandoff({ record: session, unit: "kg", profile: profile() });

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

// --- Every Training Type reads by its quantity kind (#713) ---

test("a cardio run reads as distance, time and pace", () => {
  const handoff = aiHandoff({
    record: record({
      training_type: "cardio",
      logged_sets: [
        set({
          exercise_name: "Running",
          quantity: { kind: "distance", text: "5 km", metres: 5000, duration_s: 25 * 60 },
          load: null,
        }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^Session: cardio\.$/m);
  assert.match(handoff.text, /^- Set 1: 5 km in 25 minutes, pace 5:00 per km$/m);
});

test("a yoga pose reads as a hold with its duration, not reps × weight", () => {
  const handoff = aiHandoff({
    record: record({
      training_type: "yoga",
      logged_sets: [
        set({
          exercise_name: "Warrior II",
          quantity: { kind: "duration", text: "90", seconds: 90 },
          load: null,
        }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^Session: yoga\.$/m);
  const performed = handoff.text.split("Performed:\n")[1];
  assert.equal(performed, "Warrior II\n- Set 1: held for 1 minute 30 seconds");
});

test("a mobility stretch logged as a clock time reads as a hold in words", () => {
  const handoff = aiHandoff({
    record: record({
      training_type: "mobility",
      logged_sets: [
        set({
          exercise_name: "Couch Stretch",
          quantity: { kind: "duration", text: "2:00", seconds: 120 },
          load: null,
        }),
      ],
    }),
    unit: "lb",
  });

  assert.match(handoff.text, /^Session: mobility work\.$/m);
  assert.match(handoff.text, /^- Set 1: held for 2 minutes$/m);
});

test("a HIIT interval reads as timed work, not a hold", () => {
  const handoff = aiHandoff({
    record: record({
      training_type: "hiit",
      logged_sets: [
        set({
          exercise_name: "Burpees",
          quantity: { kind: "duration", text: "0:40", seconds: 40 },
          load: null,
        }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^Session: HIIT\.$/m);
  assert.match(handoff.text, /^- Set 1: 40 seconds of work$/m);
});

test("a distance logged without a time reads as the distance alone, in its own unit", () => {
  const handoff = aiHandoff({
    record: record({
      training_type: "cardio",
      logged_sets: [
        set({ quantity: { kind: "distance", text: "3.1 mi", metres: 4988.97 }, load: null }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: 3\.1 mi$/m);
  assert.doesNotMatch(handoff.text, /pace/);
});

test("a run logged in miles reads its pace per mile", () => {
  const handoff = aiHandoff({
    record: record({
      training_type: "cardio",
      logged_sets: [
        set({
          quantity: { kind: "distance", text: "2 mi", metres: 3218.688, duration_s: 17 * 60 },
          load: null,
        }),
      ],
    }),
    unit: "lb",
  });

  assert.match(handoff.text, /^- Set 1: 2 mi in 17 minutes, pace 8:30 per mi$/m);
});

// --- Every Load type reads in plain words, in kg and in lb (#713) ---

const LOAD_CASES: ReadonlyArray<{ name: string; load: LoggedSet["load"]; kg: string; lb: string }> = [
  { name: "absolute", load: { kind: "absolute", text: "100 kg", kg: 100 },
    kg: "100 kg", lb: "220.46 lb" },
  { name: "bodyweight", load: { kind: "bodyweight", text: "BW" },
    kg: "bodyweight", lb: "bodyweight" },
  { name: "bodyweight plus extra", load: { kind: "bodyweight", text: "bodyweight + 10 kg", added_kg: 10 },
    kg: "bodyweight + 10 kg", lb: "bodyweight + 22.05 lb" },
  { name: "%1RM", load: { kind: "percent_1rm", text: "70% 1RM", percent: 70 },
    kg: "70% of 1-rep max", lb: "70% of 1-rep max" },
  { name: "range", load: { kind: "range", text: "60-70 kg", low_kg: 60, high_kg: 70 },
    kg: "60-70 kg", lb: "132.28-154.32 lb" },
  { name: "qualitative", load: { kind: "qualitative", text: "heavy band" },
    kg: "heavy band", lb: "heavy band" },
];

for (const { name, load, kg, lb } of LOAD_CASES) {
  for (const [unit, expected] of [["kg", kg], ["lb", lb]] as const) {
    test(`a ${name} Load reads "${expected}" for a ${unit} user`, () => {
      const handoff = aiHandoff({ record: record({ logged_sets: [set({ load })] }), unit });

      assert.match(handoff.text, new RegExp(`^- Set 1: 8 reps @ ${escapeRegExp(expected)}$`, "m"));
    });
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("a bodyweight Load with detail beyond plain bodyweight keeps that detail", () => {
  const handoff = aiHandoff({
    record: record({ logged_sets: [set({ load: { kind: "bodyweight", text: "BW + light band" } })] }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: 8 reps @ BW \+ light band$/m);
});

test("a %1RM Load stored without its number reads as written", () => {
  const handoff = aiHandoff({
    record: record({ logged_sets: [set({ load: { kind: "percent_1rm", text: "about 70% 1RM" } })] }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: 8 reps @ about 70% 1RM$/m);
});

test("a pure bodyweight set carries the body weight it needs, in the user’s unit", () => {
  const handoff = aiHandoff({
    record: record({
      logged_sets: [set({ load: { kind: "bodyweight", text: "bodyweight" }, body_weight_kg: 80 })],
    }),
    unit: "lb",
  });

  assert.match(handoff.text, /^- Set 1: 8 reps @ bodyweight, body weight 176\.37 lb$/m);
});

// --- Logged Effort on both scales (#713) ---

test("Effort reads on the scale it was logged in, in plain words", () => {
  const handoff = aiHandoff({
    record: record({
      logged_sets: [
        set({ position: 1, effort: { scale: "rpe", value: 7.5 } }),
        set({ position: 2, effort: { scale: "rir", value: 1 } }),
        set({ position: 3, effort: { scale: "rir", value: 0 } }),
        set({ position: 4, perceived_difficulty: 9 }),
      ],
    }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: 8 reps @ 100 kg, RPE 7\.5$/m);
  assert.match(handoff.text, /^- Set 2: 8 reps @ 100 kg, 1 rep in reserve$/m);
  assert.match(handoff.text, /^- Set 3: 8 reps @ 100 kg, 0 reps in reserve$/m);
  assert.match(handoff.text, /^- Set 4: 8 reps @ 100 kg, RPE 9$/m);
  assert.doesNotMatch(handoff.text, /RIR/);
});

test("the top of the reps-in-reserve scale reads as five or more", () => {
  const handoff = aiHandoff({
    record: record({ logged_sets: [set({ effort: { scale: "rir", value: 5 } })] }),
    unit: "kg",
  });

  assert.match(handoff.text, /^- Set 1: 8 reps @ 100 kg, 5 or more reps in reserve$/m);
});

// --- Profile context and the Sensitive-Constraint caveat (#714) ---

// A read profile: the Declared Fitness Levels and the derived sensitivity flag, plus the
// constraint text itself, which must never reach the hand-off.
type HandoffProfileFixture = Pick<Profile, "fitness_levels" | "is_sensitive" | "sensitive_constraints">;

function profile(overrides: Partial<HandoffProfileFixture> = {}): HandoffProfileFixture {
  return {
    fitness_levels: {},
    is_sensitive: false,
    sensitive_constraints: [],
    ...overrides,
  };
}

test("a declared level for the record’s Training Type adds a self-rated context line", () => {
  // Arrange
  const session = record({ training_type: "strength", duration_seconds: 52 * 60 });

  // Act
  const handoff = aiHandoff({
    record: session,
    unit: "kg",
    profile: profile({ fitness_levels: { strength: 6, yoga: 2 } }),
  });

  // Assert
  assert.equal(
    handoff.text.split("\n\nPerformed:")[0],
    [
      "Please critique this workout. Tell me what went well, what I should change next time, and anything that looks risky.",
      "",
      "Session: strength training, 52 minutes.",
      "Context: self-rated 6/10 at strength training.",
    ].join("\n"),
  );
});

test("no context line when the profile declares no level for the record’s Training Type", () => {
  // Arrange
  const session = record({ training_type: "yoga" });

  // Act
  const handoff = aiHandoff({
    record: session,
    unit: "kg",
    profile: profile({ fitness_levels: { strength: 6 } }),
  });

  // Assert
  assert.doesNotMatch(handoff.text, /self-rated/);
  assert.doesNotMatch(handoff.text, /Context:/);
});

test("a user with a Sensitive Constraint gets the caveat, and their constraints never go in", () => {
  // Arrange
  const session = record({ training_type: "strength", logged_sets: [set({})] });
  const sensitive = profile({
    fitness_levels: { strength: 4 },
    is_sensitive: true,
    sensitive_constraints: ["postpartum", "torn left ACL, rehab week 6"],
  });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg", profile: sensitive });

  // Assert
  assert.equal(handoff.showSensitiveCaveat, true);
  assert.doesNotMatch(handoff.text, /postpartum|ACL|rehab|constraint/i);
  // The action is still offered in full: the caveat informs, it never blocks.
  assert.match(handoff.text, /^Context: self-rated 4\/10 at strength training\.$/m);
  assert.match(handoff.text, /^- Set 1: 8 reps @ 100 kg$/m);
});

test("a user without a Sensitive Constraint gets no caveat", () => {
  // Arrange
  const unconstrained = profile({ fitness_levels: { strength: 6 } });

  // Act
  const handoff = aiHandoff({ record: record({}), unit: "kg", profile: unconstrained });

  // Assert
  assert.equal(handoff.showSensitiveCaveat, false);
});

test("the caveat says constraints are left out, the AI doesn’t know them, and the clinician comes first", () => {
  // Arrange / Act: the copy is a constant the sheet renders as is.
  const caveat = AI_HANDOFF_SENSITIVE_CAVEAT;

  // Assert
  assert.match(caveat, /doesn’t include your health constraints/);
  assert.match(caveat, /doesn’t know about them/);
  assert.match(caveat, /clinician’s advice comes first/);
});

test("an unread profile still hands off, without the level line, and shows the caveat anyway", () => {
  // Arrange
  const session = record({ training_type: "strength", logged_sets: [set({})] });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg", profile: null });

  // Assert
  assert.equal(handoff.showSensitiveCaveat, true);
  assert.doesNotMatch(handoff.text, /self-rated/);
  assert.match(handoff.text, /^- Set 1: 8 reps @ 100 kg$/m);
});
