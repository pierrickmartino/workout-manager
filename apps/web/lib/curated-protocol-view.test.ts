import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adoptFormDefaults,
  curatedAdoptedHref,
  curatedCaveat,
  curatedLoggedSetNotice,
  curatedProtocolRow,
  curatedSetAsideNotice,
  findCuratedProtocol,
  GENERATE_PROTOCOL_CHOICE,
  launchpadHeading,
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
  main_lift_input: "starting_weight",
  main_lifts: [
    {
      key: "squat",
      exercise_name: "Barbell Back Squat",
      default_starting_weight_kg: 20,
      starting_weight_prefill: { kg: 20, source: "default" },
      working_set_prefill: null,
    },
    {
      key: "deadlift",
      exercise_name: "Barbell Deadlift",
      default_starting_weight_kg: 40,
      starting_weight_prefill: { kg: 40, source: "default" },
      working_set_prefill: null,
    },
  ],
  lifts_needing_a_logged_set: [],
  sensitive_constraint_caveat: false,
  missing_equipment: [],
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
    { surface: "generate", label: "Generate for me", href: "/protocols/new", current: true },
    {
      surface: "curated",
      label: "Choose a Curated Protocol",
      href: "/protocols/new/curated",
      current: false,
    },
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
    equipmentFlag: null,
    href: "/protocols/new/curated/beginner-linear-progression",
  });
});

test("a row flags the required equipment the user lacks, and still links to adopting it", () => {
  // Act
  const row = curatedProtocolRow({ ...BEGINNER, missing_equipment: ["barbell", "rack"] });

  // Assert
  assert.equal(row.equipmentFlag, "Needs: barbell, rack");
  assert.equal(row.href, "/protocols/new/curated/beginner-linear-progression");
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
        reps: null,
      },
      {
        key: "deadlift",
        name: "weight_deadlift",
        label: "Barbell Deadlift",
        initialKg: 40,
        source: "default",
        hint: "Starting weight in kg",
        reps: null,
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
        working_set_prefill: null,
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
    reps: null,
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

test("the launchpad heading stops calling the card AI-only once a Curated Protocol is offered", () => {
  // Arrange — generation alone, then beside a Curated Protocol (issue #690).
  const peers = newProtocolChoices("generate", { hasCuratedProtocols: true });

  // Act
  const alone = launchpadHeading([GENERATE_PROTOCOL_CHOICE]);
  const beside = launchpadHeading(peers);

  // Assert — a human-written plan is an equal choice, not filed under generation.
  assert.deepEqual(alone, {
    title: "Generate training",
    overline: "AI PROTOCOLS · STANDALONE SESSIONS",
  });
  assert.deepEqual(beside, {
    title: "Start training",
    overline: "AI OR CURATED PROTOCOLS · STANDALONE SESSIONS",
  });
});

// --- Wave Curated Protocol: a working set per main lift (issue #693) ---------------------

const WAVE: CuratedProtocolSummary = {
  ...BEGINNER,
  identifier: "four-week-strength-waves",
  name: "Four-week strength waves",
  main_lift_input: "working_set",
  main_lifts: [
    {
      key: "squat",
      exercise_name: "Barbell Back Squat",
      default_starting_weight_kg: 20,
      // The working set is the user's own best squat; the starting-weight prefill is ignored.
      starting_weight_prefill: { kg: 82.5, source: "records" },
      working_set_prefill: { kg: 110, reps: 3, source: "records" },
    },
    {
      key: "press",
      exercise_name: "Barbell Overhead Press",
      default_starting_weight_kg: 20,
      starting_weight_prefill: { kg: 32.5, source: "records" },
      working_set_prefill: { kg: 50, reps: 8, source: "records" },
    },
  ],
};

test("a wave Curated Protocol asks for a working set per main lift, prefilled with the user’s own", () => {
  // Act
  const { lifts } = adoptFormDefaults(WAVE);

  // Assert
  assert.deepEqual(lifts, [
    {
      key: "squat",
      name: "weight_squat",
      label: "Barbell Back Squat",
      initialKg: 110,
      source: "records",
      hint: "Recent working set: weight in kg · prefilled from your records, edit it freely",
      reps: { name: "reps_squat", label: "Reps", initial: 3, hint: "Reps done at that weight, 1 to 12" },
    },
    {
      key: "press",
      name: "weight_press",
      label: "Barbell Overhead Press",
      initialKg: 50,
      source: "records",
      hint: "Recent working set: weight in kg · prefilled from your records, edit it freely",
      reps: { name: "reps_press", label: "Reps", initial: 8, hint: "Reps done at that weight, 1 to 12" },
    },
  ]);
});

test("a filled wave adopt form reads into working sets, not starting weights", () => {
  // Arrange
  const form = formOf({
    weeks: "8",
    weight_squat: "100",
    reps_squat: "5",
    weight_press: "50",
    reps_press: "8",
  });

  // Act
  const result = readAdoptForm(WAVE, form);

  // Assert
  assert.deepEqual(result, {
    ok: true,
    request: {
      weeks: 8,
      working_sets: { squat: { kg: 100, reps: 5 }, press: { kg: 50, reps: 8 } },
    },
  });
});

test("a working set with a blank or non-positive weight is refused before anything is sent", () => {
  // Act
  const zero = readAdoptForm(
    WAVE,
    formOf({ weeks: "4", weight_squat: "0", reps_squat: "5", weight_press: "50", reps_press: "8" }),
  );

  // Assert
  assert.deepEqual(zero, {
    ok: false,
    error: "Enter a working set weight above 0 kg for Barbell Back Squat.",
  });
});

for (const reps of ["", "0", "13", "2.5"]) {
  test(`a working set of ${JSON.stringify(reps)} reps is refused before anything is sent`, () => {
    // Act
    const result = readAdoptForm(
      WAVE,
      formOf({ weeks: "4", weight_squat: "100", reps_squat: "5", weight_press: "50", reps_press: reps }),
    );

    // Assert
    assert.deepEqual(result, {
      ok: false,
      error: "Enter the reps of your working set for Barbell Overhead Press, from 1 to 12.",
    });
  });
}

// --- A logged set first (issue #694) ----------------------------------------------------

test("a wave Curated Protocol the user has logged every main lift of needs no notice", () => {
  // Act / Assert
  assert.equal(curatedLoggedSetNotice(WAVE), null);
  assert.equal(curatedLoggedSetNotice(BEGINNER), null);
});

test("a main lift with no logged set is named in the notice that replaces the adopt form", () => {
  // Arrange
  const unlogged = { ...WAVE, lifts_needing_a_logged_set: ["press"] };

  // Act
  const notice = curatedLoggedSetNotice(unlogged);

  // Assert
  assert.deepEqual(notice, {
    title: "Log a working set first",
    body:
      "This plan’s weights are worked out from a set you actually did. Log a working set " +
      "of Barbell Overhead Press, 1 to 12 reps, then come back to adopt it.",
  });
});

test("several unlogged main lifts are listed in the plan’s order", () => {
  // Arrange
  const unlogged = { ...WAVE, lifts_needing_a_logged_set: ["squat", "press"] };

  // Act
  const notice = curatedLoggedSetNotice(unlogged);

  // Assert
  assert.match(notice?.body ?? "", /of Barbell Back Squat and Barbell Overhead Press, 1 to 12/);
});
