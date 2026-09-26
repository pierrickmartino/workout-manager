import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfileForm } from "./profile-validation.ts";

test("invalid profile values return messages targeted to the submitted controls", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ age: "1.5", height_cm: "0", weight_kg: "-2", default_rest_seconds: "1.5", level_strength: "11" })) form.set(key, value);
  assert.deepEqual(Object.keys(validateProfileForm(form)), ["age", "height_cm", "weight_kg", "default_rest_seconds", "level_strength"]);
});

test("optional blanks and valid numeric profile values have no errors", () => {
  const form = new FormData();
  assert.deepEqual(validateProfileForm(form), {});
  for (const [key, value] of Object.entries({ age: "0", height_cm: "180.1", weight_kg: "70.5", default_rest_seconds: "60", level_strength: "10" })) form.set(key, value);
  assert.deepEqual(validateProfileForm(form), {});
});

test("non-numeric and non-finite entries are errors rather than silently cleared values", () => {
  const form = new FormData();
  form.set("age", "NaN");
  form.set("weight_kg", "Infinity");
  assert.deepEqual(Object.keys(validateProfileForm(form)), ["age", "weight_kg"]);
});
