import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adoptFormDefaults,
  curatedProtocolRow,
  newProtocolChoices,
  readAdoptForm,
  type CuratedProtocolSummary,
} from "./curated-protocol-view.ts";

const BEGINNER: CuratedProtocolSummary = {
  identifier: "beginner-linear-progression",
  version: 1,
  name: "Beginner linear progression",
  description: "Three full-body barbell sessions a week.",
  training_type: "strength",
  sessions_per_week: 3,
  min_weeks: 4,
  max_weeks: 12,
  required_equipment: ["barbell", "rack"],
  main_lifts: [
    { key: "squat", exercise_name: "Barbell Back Squat", default_starting_weight_kg: 20 },
    { key: "deadlift", exercise_name: "Barbell Deadlift", default_starting_weight_kg: 40 },
  ],
};

function formOf(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) form.set(name, value);
  return form;
}

test("the new-Protocol entry point offers generation and Curated Protocols as peers", () => {
  // Act
  const choices = newProtocolChoices("generate", { hasCuratedProtocols: true });

  // Assert
  assert.deepEqual(choices, [
    { label: "Generate for me", href: "/protocols/new", current: true },
    { label: "Choose a Curated Protocol", href: "/protocols/new/curated", current: false },
  ]);
});

test("the Curated Protocol choice is current on the curated surface", () => {
  // Act
  const choices = newProtocolChoices("curated", { hasCuratedProtocols: true });

  // Assert
  assert.deepEqual(
    choices.map((choice) => [choice.label, choice.current]),
    [
      ["Generate for me", false],
      ["Choose a Curated Protocol", true],
    ],
  );
});

test("with nothing released the entry point offers generation alone", () => {
  // Act
  const choices = newProtocolChoices("generate", { hasCuratedProtocols: false });

  // Assert
  assert.deepEqual(
    choices.map((choice) => choice.label),
    ["Generate for me"],
  );
});

test("no choice is ever labelled Library", () => {
  // Act
  const labels = [
    ...newProtocolChoices("generate", { hasCuratedProtocols: true }),
    ...newProtocolChoices("curated", { hasCuratedProtocols: true }),
  ].map((choice) => choice.label);

  // Assert
  assert.ok(labels.every((label) => !/library/i.test(label)));
});

test("a list row summarises the program for the picker", () => {
  // Act
  const row = curatedProtocolRow(BEGINNER);

  // Assert
  assert.deepEqual(row, {
    identifier: "beginner-linear-progression",
    name: "Beginner linear progression",
    description: "Three full-body barbell sessions a week.",
    schedule: "3 sessions a week · 4–12 weeks",
    mainLifts: "Barbell Back Squat, Barbell Deadlift",
    equipment: "barbell, rack",
    href: "/protocols/new/curated/beginner-linear-progression",
  });
});

test("a one-session, fixed-length program reads in the singular without a range", () => {
  // Act
  const row = curatedProtocolRow({
    ...BEGINNER,
    sessions_per_week: 1,
    min_weeks: 6,
    max_weeks: 6,
  });

  // Assert
  assert.equal(row.schedule, "1 session a week · 6 weeks");
});

test("the adopt form starts at the shortest length with the default starting weights", () => {
  // Act
  const defaults = adoptFormDefaults(BEGINNER);

  // Assert
  assert.deepEqual(defaults, {
    weeks: 4,
    weekOptions: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    lifts: [
      { key: "squat", name: "weight_squat", label: "Barbell Back Squat", defaultKg: 20 },
      { key: "deadlift", name: "weight_deadlift", label: "Barbell Deadlift", defaultKg: 40 },
    ],
  });
});

test("a filled adopt form reads into the adopt request", () => {
  // Arrange
  const form = formOf({ weeks: "6", weight_squat: "62.5", weight_deadlift: "80" });

  // Act
  const result = readAdoptForm(BEGINNER, form);

  // Assert
  assert.deepEqual(result, {
    ok: true,
    request: { weeks: 6, starting_weights_kg: { squat: 62.5, deadlift: 80 } },
  });
});

test("a blank or non-positive starting weight is refused before anything is sent", () => {
  // Act
  const blank = readAdoptForm(BEGINNER, formOf({ weeks: "4", weight_squat: "", weight_deadlift: "80" }));
  const zero = readAdoptForm(BEGINNER, formOf({ weeks: "4", weight_squat: "60", weight_deadlift: "0" }));

  // Assert
  assert.deepEqual(blank, {
    ok: false,
    error: "Enter a starting weight above 0 kg for Barbell Back Squat.",
  });
  assert.deepEqual(zero, {
    ok: false,
    error: "Enter a starting weight above 0 kg for Barbell Deadlift.",
  });
});

test("a length outside the program’s range is refused", () => {
  // Act
  const result = readAdoptForm(BEGINNER, formOf({ weeks: "13", weight_squat: "60", weight_deadlift: "80" }));

  // Assert
  assert.deepEqual(result, { ok: false, error: "Choose a length between 4 and 12 weeks." });
});
