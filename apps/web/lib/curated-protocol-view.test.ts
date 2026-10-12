import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adoptFormDefaults,
  curatedAdoptedHref,
  curatedCaveat,
  curatedProtocolRow,
  curatedSetAsideNotice,
  findCuratedProtocol,
  newProtocolChoices,
  readAdoptForm,
  type CuratedProtocolSummary,
} from "./curated-protocol-view.ts";
import type { ProtocolIndexEntry } from "./protocols-index.ts";

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
    {
      key: "squat",
      exercise_name: "Barbell Back Squat",
      default_starting_weight_kg: 20,
      starting_weight_prefill: { kg: 20, source: "default" },
    },
    {
      key: "deadlift",
      exercise_name: "Barbell Deadlift",
      default_starting_weight_kg: 40,
      starting_weight_prefill: { kg: 40, source: "default" },
    },
  ],
  sensitive_constraint_caveat: false,
};

const FOR_SENSITIVE: CuratedProtocolSummary = { ...BEGINNER, sensitive_constraint_caveat: true };

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

test("a list row summarises the Curated Protocol for the picker", () => {
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

test("a one-session, fixed-length Curated Protocol reads in the singular without a range", () => {
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
      {
        key: "squat",
        name: "weight_squat",
        label: "Barbell Back Squat",
        initialKg: 20,
        source: "default",
        hint: "Starting weight in kg",
      },
      {
        key: "deadlift",
        name: "weight_deadlift",
        label: "Barbell Deadlift",
        initialKg: 40,
        source: "default",
        hint: "Starting weight in kg",
      },
    ],
  });
});

test("a lift prefilled from the user’s records starts there and says so", () => {
  // Arrange
  const withRecords: CuratedProtocolSummary = {
    ...BEGINNER,
    main_lifts: [
      {
        key: "squat",
        exercise_name: "Barbell Back Squat",
        default_starting_weight_kg: 20,
        starting_weight_prefill: { kg: 82.5, source: "records" },
      },
    ],
  };

  // Act
  const [squat] = adoptFormDefaults(withRecords).lifts;

  // Assert
  assert.deepEqual(squat, {
    key: "squat",
    name: "weight_squat",
    label: "Barbell Back Squat",
    initialKg: 82.5,
    source: "records",
    hint: "Starting weight in kg · prefilled from your records, edit it freely",
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

test("a length outside the Curated Protocol’s range is refused", () => {
  // Act
  const result = readAdoptForm(BEGINNER, formOf({ weeks: "13", weight_squat: "60", weight_deadlift: "80" }));

  // Assert
  assert.deepEqual(result, { ok: false, error: "Choose a length between 4 and 12 weeks." });
});

test("a Curated Protocol is found by identifier only in a successful list read", () => {
  // Arrange
  const ok = { success: true, data: [BEGINNER] };
  const failed = { success: false, data: null };

  // Act / Assert
  assert.equal(findCuratedProtocol(ok, "beginner-linear-progression"), BEGINNER);
  assert.equal(findCuratedProtocol(ok, "unreleased-curated-protocol"), undefined);
  assert.equal(findCuratedProtocol(failed, "beginner-linear-progression"), undefined);
});

// --- Sensitive Constraint caveat and set-aside adopt (issue #687, ADR-0058) ---------------

function indexEntry(overrides: Partial<ProtocolIndexEntry>): ProtocolIndexEntry {
  return {
    id: 7,
    name: "Beginner linear progression",
    label: "Beginner linear progression",
    objective: "build strength",
    training_type: "strength",
    status: "set_aside",
    performed_count: 0,
    session_count: 12,
    last_performed_on: null,
    deletable: true,
    session_ids: [],
    made_current_at: null,
    ...overrides,
  };
}

test("a user with a Sensitive Constraint sees the caveat before adopting", () => {
  // Act
  const caveat = curatedCaveat(FOR_SENSITIVE);

  // Assert
  assert.deepEqual(caveat, {
    title: "Not tailored to your constraints",
    body:
      "This plan was written for a general audience, not around your injury, rehabilitation, " +
      "postpartum or medical constraint. Adopting it sets it aside rather than making it your " +
      "Current Protocol; Switch to it when you’re ready to start.",
  });
});

test("a user without a Sensitive Constraint sees no caveat", () => {
  // Act / Assert
  assert.equal(curatedCaveat(BEGINNER), null);
});

test("a set-aside adopt lands on Protocols naming the adopted Protocol", () => {
  // Act
  const href = curatedAdoptedHref({ protocol_id: 7, set_aside: true }, 3);

  // Assert
  assert.equal(href, "/protocols?adopted=7");
});

test("an adopt that became Current lands on it with the superseded-Protocol note", () => {
  // Act / Assert
  assert.equal(curatedAdoptedHref({ protocol_id: 7, set_aside: false }, 3), "/protocols/7?set_aside=3");
  assert.equal(curatedAdoptedHref({ protocol_id: 7, set_aside: false }, null), "/protocols/7");
});

test("Protocols says the adopted Protocol is set aside and to Switch to start it", () => {
  // Arrange
  const entries = [indexEntry({ id: 3, status: "current" }), indexEntry({ id: 7 })];

  // Act
  const notice = curatedSetAsideNotice("7", entries);

  // Assert
  assert.equal(notice, "“Beginner linear progression” is set aside — Switch to start it.");
});

test("the set-aside notice is dropped once the adopted Protocol is no longer set aside", () => {
  // Arrange
  const switched = [indexEntry({ id: 7, status: "current" })];

  // Act / Assert
  assert.equal(curatedSetAsideNotice("7", switched), null);
});

test("the set-aside notice names nothing for a missing, unknown or malformed id", () => {
  // Arrange
  const entries = [indexEntry({ id: 7 })];

  // Act / Assert
  assert.equal(curatedSetAsideNotice(undefined, entries), null);
  assert.equal(curatedSetAsideNotice("8", entries), null);
  assert.equal(curatedSetAsideNotice("7abc", entries), null);
  assert.equal(curatedSetAsideNotice(["7", "7"], entries), null);
});
