import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SCHEME,
  SCHEME_OPTIONS,
  compatibleSchemes,
  compatibleSchemesForInput,
  currentScheme,
  schemeControlModel,
  schemeLabel,
} from "./scheme-view.ts";
import type { ExercisePrescription } from "./sessions-types.ts";
import type { Load } from "./load.ts";

// `scheme-view` decides what the plan view shows for one prescription's Progression Scheme
// (ADR-0064, #432): the resolved current scheme (null → default) and the compatible
// alternatives to offer — the universal schemes always, Greyskull only where the movement
// has a clean kilogram axis. These tests pin the resolution, the compatibility filter, and
// the control model.

const BODYWEIGHT: Load = { kind: "bodyweight", text: "Bodyweight" };
const WEIGHTED_BODYWEIGHT: Load = { kind: "bodyweight", text: "+10kg", added_kg: 10 };
const ABSOLUTE: Load = { kind: "absolute", text: "60kg", kg: 60 };
const PERCENT: Load = { kind: "percent_1rm", text: "70% 1RM", percent: 70 };
const RANGE: Load = { kind: "range", text: "70-80kg", low_kg: 70, high_kg: 80 };
const QUALITATIVE: Load = { kind: "qualitative", text: "moderate" };

function prescription(
  overrides: Partial<ExercisePrescription>,
): ExercisePrescription {
  return {
    position: 0,
    sets: 3,
    reps: "5",
    rest_seconds: null,
    tempo: null,
    recommended_load: ABSOLUTE,
    exercise_id: 1,
    exercise_name: "Back Squat",
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "ai_generated",
    ...overrides,
  };
}

function values(load: Load | null): string[] {
  return compatibleSchemes(load).map((option) => option.value);
}

test("an unset scheme resolves to the default", () => {
  assert.equal(currentScheme(prescription({ scheme: null })), DEFAULT_SCHEME);
  assert.equal(currentScheme(prescription({ scheme: undefined })), DEFAULT_SCHEME);
});

test("a stored scheme resolves to its own value", () => {
  assert.equal(currentScheme(prescription({ scheme: "greyskull" })), "greyskull");
});

test("an unknown stored value falls back to the default", () => {
  assert.equal(currentScheme(prescription({ scheme: "banana" })), DEFAULT_SCHEME);
});

test("schemeLabel names each scheme and falls back for null/unknown", () => {
  assert.equal(schemeLabel("static"), "Static / Manual");
  assert.equal(schemeLabel("greyskull"), "Greyskull-style Linear");
  assert.equal(schemeLabel(null), "Double Progression");
  assert.equal(schemeLabel("banana"), "Double Progression");
});

test("a clean absolute load offers the whole catalog", () => {
  assert.deepEqual(
    values(ABSOLUTE),
    SCHEME_OPTIONS.map((o) => o.value),
  );
});

test("a weighted-bodyweight load offers Greyskull too", () => {
  assert.ok(values(WEIGHTED_BODYWEIGHT).includes("greyskull"));
});

test("a pure-bodyweight load drops Greyskull but keeps the universal schemes", () => {
  const offered = values(BODYWEIGHT);
  assert.ok(!offered.includes("greyskull"));
  assert.deepEqual(offered, ["double_progression", "static", "session_count"]);
});

test("non-clean loads and a missing load drop Greyskull", () => {
  for (const load of [PERCENT, RANGE, QUALITATIVE, null]) {
    assert.ok(!values(load).includes("greyskull"));
    // The default is always compatible, so clearing always lands somewhere legal.
    assert.ok(values(load).includes(DEFAULT_SCHEME));
  }
});

test("compatibleSchemesForInput mirrors the typed predicate over raw builder fields", () => {
  const values = (kind: Parameters<typeof compatibleSchemesForInput>[0], value: string) =>
    compatibleSchemesForInput(kind, value).map((o) => o.value);

  // Absolute always has a kilogram axis → Greyskull offered.
  assert.ok(values("absolute", "60").includes("greyskull"));
  // Bodyweight with a positive added value → Greyskull offered.
  assert.ok(values("bodyweight", "10").includes("greyskull"));
  // Bodyweight with a blank/zero value is pure bodyweight → Greyskull dropped.
  assert.ok(!values("bodyweight", "").includes("greyskull"));
  assert.ok(!values("bodyweight", "0").includes("greyskull"));
  // Non-clean kinds → Greyskull dropped, universal schemes kept.
  assert.ok(!values("percent_1rm", "70").includes("greyskull"));
  assert.ok(values("qualitative", "moderate").includes(DEFAULT_SCHEME));
});

test("the control model reports current, options, and whether overridden", () => {
  const overridden = schemeControlModel(
    prescription({ scheme: "greyskull", recommended_load: ABSOLUTE }),
  );
  assert.equal(overridden.current, "greyskull");
  assert.equal(overridden.isOverridden, true);
  assert.deepEqual(
    overridden.options.map((o) => o.value),
    SCHEME_OPTIONS.map((o) => o.value),
  );

  const defaulted = schemeControlModel(
    prescription({ scheme: null, recommended_load: BODYWEIGHT }),
  );
  assert.equal(defaulted.current, DEFAULT_SCHEME);
  assert.equal(defaulted.isOverridden, false);
  assert.ok(!defaulted.options.some((o) => o.value === "greyskull"));
});
