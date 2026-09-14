import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildExercisePatch,
  hasEditorChanges,
  parseDifficultyInput,
  parseListInput,
  parseStepsInput,
  toEditorFields,
  validateEditorFields,
  type EditableExercise,
  type ExerciseEditorFields,
} from "./admin-exercise-editor.ts";

function exercise(overrides: Partial<EditableExercise> = {}): EditableExercise {
  return {
    name: "Walking Lunge",
    description: "A split-stance stride.",
    targeted_muscles: ["quads", "glutes"],
    primary_muscles: [],
    secondary_muscles: [],
    required_equipment: ["bodyweight"],
    instructions: ["Step forward.", "Lower until the knee grazes the floor."],
    difficulty: 3,
    ...overrides,
  };
}

test("seeds the form from the fetched exercise, lists one per line", () => {
  const fields = toEditorFields(exercise());

  assert.equal(fields.name, "Walking Lunge");
  assert.equal(fields.description, "A split-stance stride.");
  assert.equal(fields.targetedMuscles, "quads\nglutes");
  assert.equal(
    fields.instructions,
    "Step forward.\nLower until the knee grazes the floor.",
  );
  assert.equal(fields.difficulty, "3");
});

test("a null description and difficulty seed as blank fields", () => {
  const fields = toEditorFields(exercise({ description: null, difficulty: null }));

  assert.equal(fields.description, "");
  assert.equal(fields.difficulty, "");
});

test("parseListInput breaks on newlines and commas, trims, drops blanks", () => {
  assert.deepEqual(parseListInput("quads, glutes\n  hamstrings \n\n"), [
    "quads",
    "glutes",
    "hamstrings",
  ]);
});

test("parseStepsInput splits on lines only, keeping commas inside a step", () => {
  assert.deepEqual(parseStepsInput("Brace, then descend.\nDrive up.\n"), [
    "Brace, then descend.",
    "Drive up.",
  ]);
});

test("parseDifficultyInput: blank clears, 1-10 parses, else invalid", () => {
  assert.deepEqual(parseDifficultyInput(""), { ok: true, value: null });
  assert.deepEqual(parseDifficultyInput(" 7 "), { ok: true, value: 7 });
  assert.deepEqual(parseDifficultyInput("0"), { ok: false });
  assert.deepEqual(parseDifficultyInput("11"), { ok: false });
  assert.deepEqual(parseDifficultyInput("hard"), { ok: false });
});

test("validateEditorFields flags a blank name and a bad difficulty", () => {
  const base = toEditorFields(exercise());
  assert.equal(validateEditorFields(base), null);
  assert.match(
    validateEditorFields({ ...base, name: "   " }) ?? "",
    /name must not be blank/i,
  );
  assert.match(
    validateEditorFields({ ...base, difficulty: "99" }) ?? "",
    /difficulty/i,
  );
});

test("buildExercisePatch sends only the changed fields", () => {
  const initial = toEditorFields(exercise());
  const current: ExerciseEditorFields = {
    ...initial,
    description: "A long split-stance stride.",
    difficulty: "4",
  };

  const patch = buildExercisePatch(initial, current);

  assert.deepEqual(patch, {
    description: "A long split-stance stride.",
    difficulty: 4,
  });
});

test("buildExercisePatch is empty when nothing changed", () => {
  const initial = toEditorFields(exercise());
  assert.deepEqual(buildExercisePatch(initial, { ...initial }), {});
  assert.equal(hasEditorChanges(initial, { ...initial }), false);
});

test("buildExercisePatch treats a whitespace-only list edit as no change", () => {
  const initial = toEditorFields(exercise());
  // Reorder whitespace / add a trailing blank line — the parsed entries are identical.
  const current = { ...initial, targetedMuscles: "quads\nglutes\n\n" };
  assert.deepEqual(buildExercisePatch(initial, current), {});
});

test("buildExercisePatch clears a description to null when emptied", () => {
  const initial = toEditorFields(exercise());
  const patch = buildExercisePatch(initial, { ...initial, description: "  " });
  assert.deepEqual(patch, { description: null });
});

test("buildExercisePatch sends an edited muscle-emphasis split", () => {
  const initial = toEditorFields(exercise());
  const patch = buildExercisePatch(initial, {
    ...initial,
    primaryMuscles: "quads",
    secondaryMuscles: "glutes",
  });
  assert.deepEqual(patch, {
    primary_muscles: ["quads"],
    secondary_muscles: ["glutes"],
  });
});

test("buildExercisePatch sends a same-identity casing fix of the name", () => {
  const initial = toEditorFields(exercise({ name: "walking lunge" }));
  const patch = buildExercisePatch(initial, { ...initial, name: "Walking Lunge" });
  assert.deepEqual(patch, { name: "Walking Lunge" });
});
