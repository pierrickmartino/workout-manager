import { test } from "node:test";
import assert from "node:assert/strict";

import { aiHandoff } from "./ai-handoff.ts";
import { record, set } from "./ai-handoff.fixtures.ts";
import type { ExercisePrescription } from "./sessions-types.ts";

// --- Prescribed vs. Performed (ADR-0132, #715): a plan-backed record carries the plan as its own
// labelled block, before and never merged with what was done.

// One Exercise Prescription, defaulting to a plain 3 × 8 with no Load or target.
function prescription(overrides: Partial<ExercisePrescription>): ExercisePrescription {
  return {
    position: 1,
    sets: 3,
    reps: "8",
    rest_seconds: null,
    tempo: null,
    recommended_load: null,
    exercise_id: 1,
    exercise_name: "Bench Press",
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "generated",
    ...overrides,
  };
}

test("a plan-backed record carries the objective and a Prescribed block before the Performed block", () => {
  // Arrange
  const sourcePlan = {
    objective: "build strength",
    prescriptions: [
      prescription({ position: 2, exercise_id: 2, exercise_name: "Barbell Row", sets: 2,
        prescribed_quantity: { kind: "repetitions", text: "10", count: 10 },
        recommended_load: { kind: "absolute", text: "60 kg", kg: 60 } }),
      prescription({ position: 1, exercise_id: 1, exercise_name: "Bench Press",
        prescribed_quantity: { kind: "repetitions", text: "5", count: 5 },
        recommended_load: { kind: "absolute", text: "100 kg", kg: 100 },
        target_effort: { scale: "rpe", value: 8 } }),
    ],
  };
  const session = record({
    session_id: 42,
    completion_outcome: "completed",
    logged_sets: [
      set({ position: 1, exercise_id: 1, quantity: { kind: "repetitions", text: "5", count: 5 },
        effort: { scale: "rpe", value: 9 } }),
      set({ position: 2, exercise_id: 2, exercise_name: "Barbell Row",
        quantity: { kind: "repetitions", text: "10", count: 10 },
        load: { kind: "absolute", text: "60 kg", kg: 60 } }),
    ],
  });

  // Act
  const handoff = aiHandoff({ record: session, unit: "kg", plan: sourcePlan });

  // Assert
  assert.equal(
    handoff.text.split("\n\n").slice(1).join("\n\n"),
    [
      "Session: strength training. Finished the whole session.",
      "Plan goal: build strength.",
      "",
      "Prescribed:",
      "Bench Press",
      "- 3 sets: 5 reps @ 100 kg, target RPE 8",
      "Barbell Row",
      "- 2 sets: 10 reps @ 60 kg",
      "",
      "Performed:",
      "Bench Press",
      "- Set 1: 5 reps @ 100 kg, RPE 9",
      "Barbell Row",
      "- Set 1: 10 reps @ 60 kg",
    ].join("\n"),
  );
});

test("a substituted exercise appears only in Performed, and the one it replaced only in Prescribed", () => {
  // Arrange — the plan prescribes Squat (2); Goblet Squat (9) was done in its place
  const sourcePlan = {
    prescriptions: [
      prescription({ position: 1, exercise_id: 1, exercise_name: "Bench Press" }),
      prescription({ position: 2, exercise_id: 2, exercise_name: "Squat" }),
    ],
  };
  const session = record({
    session_id: 42,
    logged_sets: [
      set({ position: 1, exercise_id: 1 }),
      set({ position: 2, exercise_id: 9, exercise_name: "Goblet Squat" }),
    ],
  });

  // Act
  const [prescribed, performed] = aiHandoff({ record: session, unit: "kg", plan: sourcePlan })
    .text.split("\n\nPerformed:\n");

  // Assert
  assert.match(prescribed, /^Squat \(not done\)$/m);
  assert.doesNotMatch(prescribed, /Goblet Squat/);
  assert.match(performed, /^Goblet Squat \(not in the plan\)$/m);
  assert.doesNotMatch(performed, /^Squat/m);
  assert.match(performed, /^Bench Press$/m);
});

test("an extra exercise beyond the plan appears only in Performed", () => {
  // Arrange — everything prescribed was done, plus Face Pull (5) on top
  const sourcePlan = { prescriptions: [prescription({ exercise_id: 1 })] };
  const session = record({
    session_id: 42,
    logged_sets: [
      set({ position: 1, exercise_id: 1 }),
      set({ position: 2, exercise_id: 5, exercise_name: "Face Pull" }),
    ],
  });

  // Act
  const [prescribed, performed] = aiHandoff({ record: session, unit: "kg", plan: sourcePlan })
    .text.split("\n\nPerformed:\n");

  // Assert
  assert.doesNotMatch(prescribed, /Face Pull|not done/);
  assert.match(performed, /^Face Pull \(not in the plan\)\n- Set 1: 8 reps @ 100 kg$/m);
  assert.match(performed, /^Bench Press$/m);
});

test("a skipped exercise appears only in Prescribed, with what the plan asked for", () => {
  // Arrange — the plan prescribes Deadlift (3); it was never performed
  const sourcePlan = {
    prescriptions: [
      prescription({ position: 1, exercise_id: 1 }),
      prescription({ position: 2, exercise_id: 3, exercise_name: "Deadlift", sets: 1, reps: "5",
        recommended_load: { kind: "absolute", text: "140 kg", kg: 140 } }),
    ],
  };
  const session = record({
    session_id: 42,
    completion_outcome: "incomplete",
    logged_sets: [set({ position: 1, exercise_id: 1 })],
  });

  // Act
  const [prescribed, performed] = aiHandoff({ record: session, unit: "kg", plan: sourcePlan })
    .text.split("\n\nPerformed:\n");

  // Assert
  assert.match(prescribed, /^Deadlift \(not done\)\n- 1 set: 5 reps @ 140 kg$/m);
  assert.doesNotMatch(performed, /Deadlift/);
  assert.match(prescribed, /Ended early: 1 of 2 exercises done\./);
});

test("a plan-less record carries neither a Prescribed block nor a plan goal", () => {
  // Act
  const handoff = aiHandoff({ record: record({ logged_sets: [set({})] }), unit: "kg" });

  // Assert
  assert.doesNotMatch(handoff.text, /Prescribed:|Plan goal:|not in the plan/);
  assert.match(handoff.text, /^Performed:\nBench Press$/m);
});

test("a plan-backed record whose plan couldn’t be read hands off record-only", () => {
  // Act
  const handoff = aiHandoff({
    record: record({ session_id: 42, logged_sets: [set({})] }),
    unit: "kg",
    plan: null,
  });

  // Assert
  assert.doesNotMatch(handoff.text, /Prescribed:|Plan goal:|not in the plan/);
  assert.match(handoff.text, /^Performed:\nBench Press$/m);
});

test("a standalone plan with no objective adds no plan-goal line", () => {
  // Act
  const handoff = aiHandoff({
    record: record({ session_id: 42, logged_sets: [set({})] }),
    unit: "kg",
    plan: { objective: null, prescriptions: [prescription({})] },
  });

  // Assert
  assert.doesNotMatch(handoff.text, /Plan goal:/);
  assert.match(handoff.text, /^Prescribed:\nBench Press\n- 3 sets: 8 reps$/m);
});

test("the plan’s Progression for the Next Session never goes in", () => {
  // Arrange — a prescription carrying a chosen Progression Scheme
  const sourcePlan = {
    objective: "build strength",
    prescriptions: [prescription({ scheme: "double_progression" })],
  };

  // Act
  const handoff = aiHandoff({
    record: record({ session_id: 42, completion_outcome: "completed", logged_sets: [set({})] }),
    unit: "kg",
    plan: sourcePlan,
  });

  // Assert
  assert.doesNotMatch(handoff.text, /progression|next session|next time you|increase/i);
});

test("a prescribed amount reads by its kind, in the user’s unit, with its Set Type and target", () => {
  // Arrange — a free-text rep range, a typed hold, and a %1RM warm-up targeting reps in reserve
  const sourcePlan = {
    prescriptions: [
      prescription({ position: 1, exercise_id: 1, reps: "8-12",
        recommended_load: { kind: "absolute", text: "100 kg", kg: 100 } }),
      prescription({ position: 2, exercise_id: 2, exercise_name: "Plank", sets: 2, reps: "60s",
        prescribed_quantity: { kind: "duration", text: "1:00", seconds: 60 } }),
      prescription({ position: 3, exercise_id: 3, exercise_name: "Squat", set_type: "warm_up",
        reps: "AMRAP", recommended_load: { kind: "percent_1rm", text: "50% 1RM", percent: 50 },
        target_effort: { scale: "rir", value: 2 } }),
    ],
  };

  // Act
  const handoff = aiHandoff({ record: record({ session_id: 42 }), unit: "lb", plan: sourcePlan });

  // Assert
  assert.match(handoff.text, /^- 3 sets: 8-12 reps @ 220(\.\d+)? lb$/m);
  assert.match(handoff.text, /^- 2 sets: 1 minute of work$/m);
  assert.match(
    handoff.text,
    /^- 3 sets \(warm-up\): AMRAP @ 50% of 1-rep max, target 2 reps in reserve$/m,
  );
});

test("a plan with no prescriptions adds no empty Prescribed heading", () => {
  // Act
  const handoff = aiHandoff({
    record: record({ session_id: 42, logged_sets: [set({})] }),
    unit: "kg",
    plan: { objective: "build strength", prescriptions: [] },
  });

  // Assert
  assert.doesNotMatch(handoff.text, /Prescribed:/);
  assert.match(handoff.text, /^Plan goal: build strength\.$/m);
});
