import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adoptFormSnapshot,
  curatedPlanView,
  defaultFormSnapshot,
  defaultPreviewRequest,
  previewControls,
  type CuratedPreviewResponse,
  type CuratedPreview,
} from "./curated-plan-preview.ts";
import type { AdoptFormDefaults } from "./curated-protocol-view.ts";

const SQUAT = {
  exercise_name: "Barbell Back Squat",
  sets: 3,
  reps: "5",
  rest_seconds: 180,
  recommended_load: { kind: "absolute" as const, text: "62.5 kg", kg: 62.5 },
  prescribed_quantity: { kind: "repetitions" as const, text: "5", count: 5 },
  scheme: "greyskull",
};

const CHIN_UP = {
  exercise_name: "Chin-Up",
  sets: 3,
  reps: "8",
  rest_seconds: 90,
  recommended_load: { kind: "qualitative" as const, text: "moderate" },
  prescribed_quantity: { kind: "repetitions" as const, text: "8", count: 8 },
  scheme: "double_progression",
};

// Two weeks of a two-Session pattern: the smallest plan with more than one of each grouping.
const PREVIEW: CuratedPreviewResponse = {
  identifier: "beginner-linear-progression",
  version: 1,
  weeks: 2,
  sessions_per_week: 2,
  sessions: [
    { week: 1, day: 1, title: "Workout A", prescriptions: [SQUAT, CHIN_UP] },
    { week: 1, day: 2, title: "Workout B", prescriptions: [SQUAT] },
    { week: 2, day: 1, title: "Workout A", prescriptions: [SQUAT, CHIN_UP] },
    { week: 2, day: 2, title: "Workout B", prescriptions: [SQUAT] },
  ],
};

test("the preview reads as its Sessions grouped by week", () => {
  // Act
  const view = curatedPlanView(PREVIEW);

  // Assert
  assert.equal(view.summary, "4 sessions over 2 weeks");
  assert.deepEqual(
    view.weeks.map((week) => [week.heading, week.sessions.map((s) => s.heading)]),
    [
      ["Week 1", ["Day 1 · Workout A", "Day 2 · Workout B"]],
      ["Week 2", ["Day 1 · Workout A", "Day 2 · Workout B"]],
    ],
  );
});

test("each previewed Prescription shows its dose, the Load to be written and its scheme", () => {
  // Act
  const [session] = curatedPlanView(PREVIEW).weeks[0].sessions;

  // Assert
  assert.deepEqual(session.lines, [
    {
      key: "1-1-0",
      exercise: "Barbell Back Squat",
      dose: "3 × 5",
      load: "62.5 kg",
      scheme: "Greyskull-style Linear",
    },
    {
      key: "1-1-1",
      exercise: "Chin-Up",
      dose: "3 × 8",
      load: "moderate",
      scheme: "Double Progression",
    },
  ]);
});

test("a one-week, one-Session plan reads in the singular", () => {
  // Act
  const view = curatedPlanView({
    ...PREVIEW,
    weeks: 1,
    sessions_per_week: 1,
    sessions: [PREVIEW.sessions[0]],
  });

  // Assert
  assert.equal(view.summary, "1 session over 1 week");
});

const DEFAULTS: AdoptFormDefaults = {
  weeks: 4,
  weekOptions: [4, 5, 6],
  lifts: [
    {
      key: "squat",
      name: "weight_squat",
      label: "Barbell Back Squat",
      defaultKg: 20,
      source: "default",
      hint: "Starting weight in kg",
    },
    {
      key: "deadlift",
      name: "weight_deadlift",
      label: "Barbell Deadlift",
      defaultKg: 40,
      source: "default",
      hint: "Starting weight in kg",
    },
  ],
};

function formOf(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) form.set(name, value);
  return form;
}

function previewOf(entries: Record<string, string>): CuratedPreview {
  return {
    snapshot: adoptFormSnapshot(DEFAULTS, formOf(entries)),
    plan: curatedPlanView(PREVIEW),
  };
}

const AS_PREVIEWED = { weeks: "6", weight_squat: "62.5", weight_deadlift: "90" };

test("with nothing previewed yet, Adopt waits for a preview", () => {
  // Act
  const controls = previewControls(null, defaultFormSnapshot(DEFAULTS));

  // Assert
  assert.deepEqual(controls, {
    status: "none",
    canAdopt: false,
    previewLabel: "Preview plan",
    notice: "Preview the plan before adopting.",
  });
});

test("the preview of the default inputs matches the untouched form", () => {
  // Arrange
  const preview = { snapshot: defaultFormSnapshot(DEFAULTS), plan: curatedPlanView(PREVIEW) };
  const untouched = formOf({ weeks: "4", weight_squat: "20", weight_deadlift: "40" });

  // Act
  const controls = previewControls(preview, adoptFormSnapshot(DEFAULTS, untouched));

  // Assert
  assert.deepEqual(controls, {
    status: "current",
    canAdopt: true,
    previewLabel: "Preview again",
    notice: null,
  });
});

test("editing an input after previewing makes the preview stale until it is re-previewed", () => {
  // Arrange
  const preview = previewOf(AS_PREVIEWED);
  const edited = formOf({ ...AS_PREVIEWED, weight_squat: "65" });

  // Act
  const stale = previewControls(preview, adoptFormSnapshot(DEFAULTS, edited));
  const rePreviewed = previewControls(
    previewOf({ ...AS_PREVIEWED, weight_squat: "65" }),
    adoptFormSnapshot(DEFAULTS, edited),
  );

  // Assert
  assert.deepEqual(stale, {
    status: "stale",
    canAdopt: false,
    previewLabel: "Preview again",
    notice: "You changed the inputs. Preview again before adopting.",
  });
  assert.equal(rePreviewed.status, "current");
  assert.equal(rePreviewed.canAdopt, true);
});

test("changing the length makes the preview stale too", () => {
  // Act
  const controls = previewControls(
    previewOf(AS_PREVIEWED),
    adoptFormSnapshot(DEFAULTS, formOf({ ...AS_PREVIEWED, weeks: "5" })),
  );

  // Assert
  assert.equal(controls.status, "stale");
});

test("the same weight typed differently still matches the preview", () => {
  // Act
  const controls = previewControls(
    previewOf(AS_PREVIEWED),
    adoptFormSnapshot(DEFAULTS, formOf({ ...AS_PREVIEWED, weight_squat: " 62.50 " })),
  );

  // Assert
  assert.equal(controls.status, "current");
});

test("a blank or unreadable input never matches a preview", () => {
  // Act
  const blank = previewControls(
    previewOf(AS_PREVIEWED),
    adoptFormSnapshot(DEFAULTS, formOf({ ...AS_PREVIEWED, weight_deadlift: "" })),
  );
  const garbage = previewControls(
    previewOf({ ...AS_PREVIEWED, weight_deadlift: "abc" }),
    adoptFormSnapshot(DEFAULTS, formOf({ ...AS_PREVIEWED, weight_deadlift: "abc" })),
  );

  // Assert
  assert.equal(blank.canAdopt, false);
  assert.equal(garbage.canAdopt, false);
});

test("the page previews the untouched form’s defaults before the user edits anything", () => {
  // Act
  const request = defaultPreviewRequest(DEFAULTS);

  // Assert
  assert.deepEqual(request, { weeks: 4, starting_weights_kg: { squat: 20, deadlift: 40 } });
});
