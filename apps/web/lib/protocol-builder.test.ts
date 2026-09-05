import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initBuilderDraft,
  builderReducer,
  builderMatrix,
  supersetLayout,
  toDeployPayload,
  toSimulatePayload,
  classifyDrag,
  resolveDrop,
  dragFeedback,
  dragMicrocopy,
  rowDropId,
  chipDropId,
  boxDropId,
  quantityToDraftFields,
} from "./protocol-builder.ts";
import type { BuilderDraft, DraftPrescription } from "./protocol-builder.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// The Protocol Builder draft reducer (Module D, ADR-0020) is a pure reducer over
// the client-side builder state — nothing touches the live Protocol until DEPLOY.
// `initBuilderDraft` reads a fetched Protocol into an editable draft that flags
// which Sessions are performed (read-only, frozen prefix). The reducer edits a
// Prescription's fields and Load in an un-performed Session; `toDeployPayload`
// derives the desired un-performed tail the deploy endpoint receives.

function prescription(overrides = {}) {
  return {
    position: 0,
    sets: 3,
    reps: "5",
    rest_seconds: 90,
    tempo: null,
    recommended_load: { kind: "absolute", text: "60 kg", kg: 60 },
    superset_group: null,
    round_rest_seconds: null,
    exercise_id: 100,
    exercise_name: "Back Squat",
    exercise_description: null,
    targeted_muscles: ["quads"],
    required_equipment: ["barbell"],
    provenance: "curated",
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    session_id: 1,
    position: 0,
    week: 1,
    day: 1,
    title: null,
    performed: false,
    prescriptions: [prescription()],
    ...overrides,
  };
}

function protocol(overrides = {}): ProtocolProgress {
  return {
    id: 7,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "gain muscle mass",
    sessions_per_week: 1,
    weeks: 2,
    duration_minutes: 45,
    name: null,
    label: "gain muscle mass · strength",
    completed_count: 0,
    next_session: null,
    sessions: [session()],
    ...overrides,
  } as ProtocolProgress;
}

test("initBuilderDraft carries the Protocol shape and flags performed Sessions", () => {
  // Arrange — a Protocol whose first Session is performed, second is not
  const source = protocol({
    sessions: [
      session({ session_id: 1, performed: true }),
      session({ session_id: 2, position: 1, week: 1, day: 2, performed: false }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source);

  // Assert
  assert.equal(draft.protocolId, 7);
  assert.equal(draft.weeks, 2);
  assert.equal(draft.sessionsPerWeek, 1);
  assert.deepEqual(
    draft.sessions.map((s) => [s.sessionId, s.performed]),
    [
      [1, true],
      [2, false],
    ],
  );
});

test("initBuilderDraft auto-unlinks Supersets and flags suppression for a Sensitive-Constraint user", () => {
  // Arrange — an un-performed Session holding a two-member Superset, opened by a user
  // with a Sensitive Constraint. Supersets compress rest and raise intensity, so they
  // are paused while the constraint is active (ADR-0023): the draft opens flat with a
  // banner, and the validator remains the backstop at DEPLOY.
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({ superset_group: "1", round_rest_seconds: 120 }),
          prescription({ superset_group: "1", round_rest_seconds: 120 }),
        ],
      }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source, { hasSensitiveConstraint: true });

  // Assert — every member is ungrouped (staged, not committed) and the banner flag set
  const members = draft.sessions[0].prescriptions;
  assert.deepEqual(
    members.map((p) => p.supersetGroup),
    [null, null],
  );
  assert.deepEqual(
    members.map((p) => p.roundRestSeconds),
    [null, null],
  );
  assert.equal(draft.supersetsSuppressed, true);
});

test("initBuilderDraft keeps Supersets and leaves suppression off for a non-sensitive user", () => {
  // Arrange — the same grouped Session, opened by a user with no Sensitive Constraint
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({ superset_group: "1", round_rest_seconds: 120 }),
          prescription({ superset_group: "1", round_rest_seconds: 120 }),
        ],
      }),
    ],
  });

  // Act — no option (the default) preserves grouping
  const draft = initBuilderDraft(source);

  // Assert — the Superset survives and no banner is shown
  const members = draft.sessions[0].prescriptions;
  assert.deepEqual(
    members.map((p) => p.supersetGroup),
    ["1", "1"],
  );
  assert.equal(draft.supersetsSuppressed, false);
});

test("initBuilderDraft leaves a performed Session's Superset untouched under suppression", () => {
  // Arrange — a performed (frozen) Session carries a Superset; a Sensitive-Constraint
  // user opens the builder. The frozen prefix is settled record (ADR-0020) and is never
  // deployed, so the auto-unlink only touches the editable tail.
  const source = protocol({
    sessions: [
      session({
        session_id: 1,
        performed: true,
        prescriptions: [
          prescription({ superset_group: "1", round_rest_seconds: 120 }),
          prescription({ superset_group: "1", round_rest_seconds: 120 }),
        ],
      }),
      session({ session_id: 2, position: 1, week: 1, day: 2, performed: false }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source, { hasSensitiveConstraint: true });

  // Assert — the performed Session's grouping is preserved; the banner still shows
  assert.deepEqual(
    draft.sessions[0].prescriptions.map((p) => p.supersetGroup),
    ["1", "1"],
  );
  assert.equal(draft.supersetsSuppressed, true);
});

test("initBuilderDraft expands a stored Load into the picker's kind and value", () => {
  // Arrange — a %-of-1RM Load
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({
            recommended_load: { kind: "percent_1rm", text: "70% 1RM", percent: 70 },
          }),
        ],
      }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source);

  // Assert
  assert.equal(draft.sessions[0].prescriptions[0].loadKind, "percent_1rm");
  assert.equal(draft.sessions[0].prescriptions[0].loadValue, "70");
});

test("EDIT_PRESCRIPTION changes a field in an un-performed Session", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — retarget sets from 3 to 5
  const next = builderReducer(draft, {
    type: "EDIT_PRESCRIPTION",
    sessionId: 1,
    position: 0,
    field: "sets",
    value: 5,
  });

  // Assert — the field changed, and the original draft is untouched (immutable)
  assert.equal(next.sessions[0].prescriptions[0].sets, 5);
  assert.equal(draft.sessions[0].prescriptions[0].sets, 3);
});

test("EDIT_LOAD replaces a Prescription's Load kind and value", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — switch the Load to bodyweight
  const next = builderReducer(draft, {
    type: "EDIT_LOAD",
    sessionId: 1,
    position: 0,
    loadKind: "bodyweight",
    loadValue: "10",
  });

  // Assert
  assert.equal(next.sessions[0].prescriptions[0].loadKind, "bodyweight");
  assert.equal(next.sessions[0].prescriptions[0].loadValue, "10");
});

test("SET_SCHEME selects a Progression Scheme on a Prescription and carries it through DEPLOY", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — choose Greyskull (compatible with the absolute-load default)
  const next = builderReducer(draft, {
    type: "SET_SCHEME",
    sessionId: 1,
    position: 0,
    scheme: "greyskull",
  });

  // Assert — stored on the draft and emitted in the deploy payload
  assert.equal(next.sessions[0].prescriptions[0].scheme, "greyskull");
  const payload = toDeployPayload(next, "kg");
  assert.equal(payload.sessions[0].prescriptions[0].scheme, "greyskull");
});

test("SET_SCHEME with null clears the selection back to the default", () => {
  // Arrange — a movement already carrying a chosen scheme
  const draft = builderReducer(initBuilderDraft(protocol()), {
    type: "SET_SCHEME",
    sessionId: 1,
    position: 0,
    scheme: "greyskull",
  });

  // Act — clear it
  const next = builderReducer(draft, {
    type: "SET_SCHEME",
    sessionId: 1,
    position: 0,
    scheme: null,
  });

  // Assert — null in the draft and the payload (the read side resolves it to the default)
  assert.equal(next.sessions[0].prescriptions[0].scheme, null);
  assert.equal(toDeployPayload(next, "kg").sessions[0].prescriptions[0].scheme, null);
});

test("SET_SET_TYPE annotates a Prescription's Set Type and carries it through DEPLOY", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — tag the movement as a warm-up
  const next = builderReducer(draft, {
    type: "SET_SET_TYPE",
    sessionId: 1,
    position: 0,
    setType: "warm_up",
  });

  // Assert — stored on the draft and emitted in the deploy payload (#463/#466)
  assert.equal(next.sessions[0].prescriptions[0].setType, "warm_up");
  const payload = toDeployPayload(next, "kg");
  assert.equal(payload.sessions[0].prescriptions[0].set_type, "warm_up");
});

test("SET_SET_TYPE with null clears the annotation back to the working default", () => {
  // Arrange — a movement already tagged with a Set Type
  const draft = builderReducer(initBuilderDraft(protocol()), {
    type: "SET_SET_TYPE",
    sessionId: 1,
    position: 0,
    setType: "warm_up",
  });

  // Act — clear it (the working default is stored as unset)
  const next = builderReducer(draft, {
    type: "SET_SET_TYPE",
    sessionId: 1,
    position: 0,
    setType: null,
  });

  // Assert — null in the draft and the payload (the read side resolves it to working)
  assert.equal(next.sessions[0].prescriptions[0].setType, null);
  assert.equal(toDeployPayload(next, "kg").sessions[0].prescriptions[0].set_type, null);
});

test("initBuilderDraft carries an existing Prescription's stored scheme", () => {
  // Arrange — a Protocol whose movement already carries a scheme selection
  const source = protocol({
    sessions: [session({ prescriptions: [prescription({ scheme: "session_count" })] })],
  });

  // Act
  const draft = initBuilderDraft(source);

  // Assert
  assert.equal(draft.sessions[0].prescriptions[0].scheme, "session_count");
});

test("toDeployPayload carries Set Type, Target Effort, and Exercise Note through DEPLOY", () => {
  // Arrange — a movement whose generation put a Set Type, a Target Effort, and a Note on it
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({
            set_type: "amrap",
            target_effort: { scale: "rpe", value: 8 },
            note: "pause on the chest",
          }),
        ],
      }),
    ],
  });
  const draft = initBuilderDraft(source);

  // Act
  const payload = toDeployPayload(draft, "kg");

  // Assert — the three fields ride the Deploy payload (Target Effort as scale+value)
  const emitted = payload.sessions[0].prescriptions[0];
  assert.equal(emitted.set_type, "amrap");
  assert.equal(emitted.target_effort_scale, "rpe");
  assert.equal(emitted.target_effort_value, 8);
  assert.equal(emitted.note, "pause on the chest");
});

test("initBuilderDraft carries an existing Prescription's stored Set Type, Target Effort, and Note", () => {
  // Arrange — a Protocol whose movement already carries all three fields
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({
            set_type: "warm_up",
            target_effort: { scale: "rir", value: 2 },
            note: "brace hard",
          }),
        ],
      }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source);

  // Assert
  const drafted = draft.sessions[0].prescriptions[0];
  assert.equal(drafted.setType, "warm_up");
  assert.deepEqual(drafted.targetEffort, { scale: "rir", value: 2 });
  assert.equal(drafted.note, "brace hard");
});

test("toDeployPayload emits unset Set Type / Target Effort / Note as null for a plain working set", () => {
  // Arrange — a plain movement (the generation left the three advanced fields unset)
  const draft = initBuilderDraft(protocol());

  // Act
  const emitted = toDeployPayload(draft, "kg").sessions[0].prescriptions[0];

  // Assert — nothing is fabricated; each rides as null (the domain default is applied server-side)
  assert.equal(emitted.set_type, null);
  assert.equal(emitted.target_effort_scale, null);
  assert.equal(emitted.target_effort_value, null);
  assert.equal(emitted.note, null);
});

test("initBuilderDraft seeds the typed Quantity kind and unit from the stored Prescribed Quantity", () => {
  // Arrange — a Protocol whose movements carry a duration and a distance-in-miles Quantity
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({
            reps: "45s",
            prescribed_quantity: { kind: "duration", text: "45s", seconds: 45 },
          }),
          prescription({
            reps: "3",
            prescribed_quantity: { kind: "distance", text: "3 mi", metres: 4828 },
          }),
        ],
      }),
    ],
  });

  // Act
  const [held, run] = initBuilderDraft(source).sessions[0].prescriptions;

  // Assert — the stored kind is authoritative; the distance unit is recovered from the text
  assert.equal(held.quantityKind, "duration");
  assert.equal(held.quantityUnit, "km");
  assert.equal(run.quantityKind, "distance");
  assert.equal(run.quantityUnit, "mi");
});

test("initBuilderDraft defaults an absent Prescribed Quantity to a rep count in km", () => {
  // Arrange — a legacy/pre-backfill movement with no typed Quantity on the read
  const draft = initBuilderDraft(protocol());

  // Assert — the selector opens sensibly rather than crashing on a missing kind
  const drafted = draft.sessions[0].prescriptions[0];
  assert.equal(drafted.quantityKind, "repetitions");
  assert.equal(drafted.quantityUnit, "km");
});

test("SET_QUANTITY picks the Quantity kind and unit without touching the target", () => {
  // Arrange — a plain rep-count movement in an un-performed Session
  const draft = initBuilderDraft(protocol());

  // Act — the user picks Distance in miles through the Quantity selector
  const next = builderReducer(draft, {
    type: "SET_QUANTITY",
    sessionId: 1,
    position: 0,
    quantityKind: "distance",
    quantityUnit: "mi",
  });

  // Assert — kind and unit change; the free-text target (reps) is left for its own edit
  const edited = next.sessions[0].prescriptions[0];
  assert.equal(edited.quantityKind, "distance");
  assert.equal(edited.quantityUnit, "mi");
  assert.equal(edited.reps, draft.sessions[0].prescriptions[0].reps);
});

test("toDeployPayload carries the typed Quantity kind and unit through DEPLOY", () => {
  // Arrange — a distance-in-miles movement authored in the Builder
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({
            reps: "5",
            prescribed_quantity: { kind: "distance", text: "5 mi", metres: 8047 },
          }),
        ],
      }),
    ],
  });
  const draft = initBuilderDraft(source);

  // Act
  const emitted = toDeployPayload(draft, "kg").sessions[0].prescriptions[0];

  // Assert — the pick rides the payload so the server persists it a distance, not reps
  assert.equal(emitted.quantity_kind, "distance");
  assert.equal(emitted.quantity_unit, "mi");
});

test("quantityToDraftFields reads the kind and recovers the distance unit from the text", () => {
  // Arrange / Act / Assert — a pure reversal of a stored Quantity into the editable fields
  assert.deepEqual(quantityToDraftFields(null), { kind: "repetitions", unit: "km" });
  assert.deepEqual(
    quantityToDraftFields({ kind: "duration", text: "45s", seconds: 45 }),
    { kind: "duration", unit: "km" },
  );
  assert.deepEqual(
    quantityToDraftFields({ kind: "distance", text: "5 mi", metres: 8047 }),
    { kind: "distance", unit: "mi" },
  );
});

test("editing a performed Session is a no-op (frozen prefix)", () => {
  // Arrange — Session 1 is performed
  const draft = initBuilderDraft(
    protocol({ sessions: [session({ session_id: 1, performed: true })] }),
  );

  // Act — an edit aimed at the frozen Session
  const next = builderReducer(draft, {
    type: "EDIT_PRESCRIPTION",
    sessionId: 1,
    position: 0,
    field: "sets",
    value: 99,
  });

  // Assert — nothing changed
  assert.deepEqual(next, draft);
});

test("toDeployPayload emits only the un-performed tail with Load as kind+value", () => {
  // Arrange — a performed Session 1 and an edited un-performed Session 2
  const base = initBuilderDraft(
    protocol({
      sessions: [
        session({ session_id: 1, performed: true }),
        session({
          session_id: 2,
          position: 1,
          week: 1,
          day: 2,
          performed: false,
        }),
      ],
    }),
  );
  const draft = builderReducer(base, {
    type: "EDIT_LOAD",
    sessionId: 2,
    position: 0,
    loadKind: "percent_1rm",
    loadValue: "80",
  });

  // Act
  const payload = toDeployPayload(draft, "kg");

  // Assert — the frozen Session 1 is absent; Session 2 carries its edited Load
  assert.equal(payload.weeks, 2);
  assert.equal(payload.sessions_per_week, 1);
  assert.deepEqual(
    payload.sessions.map((s) => s.session_id),
    [2],
  );
  const prescription = payload.sessions[0].prescriptions[0];
  assert.equal(prescription.load_kind, "percent_1rm");
  assert.equal(prescription.load_value, "80");
  assert.equal(prescription.exercise_id, 100);
});

test("initBuilderDraft carries the Protocol name into the draft", () => {
  // Arrange — a named Protocol
  const source = protocol({ name: "Summer Split" });

  // Act
  const draft = initBuilderDraft(source);

  // Assert
  assert.equal(draft.name, "Summer Split");
});

test("initBuilderDraft leaves the name null when the Protocol is unnamed", () => {
  // Arrange / Act — an adopted Protocol never named
  const draft = initBuilderDraft(protocol({ name: null }));

  // Assert
  assert.equal(draft.name, null);
});

test("EDIT_NAME sets the draft name without touching Sessions", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — the config panel edits the name
  const next = builderReducer(draft, { type: "EDIT_NAME", name: "My Plan" });

  // Assert — the name changed, Sessions untouched, original draft immutable
  assert.equal(next.name, "My Plan");
  assert.deepEqual(next.sessions, draft.sessions);
  assert.equal(draft.name, null);
});

test("toDeployPayload carries the edited name so it rides through DEPLOY", () => {
  // Arrange — a draft whose name the user edited in the config panel
  const draft = builderReducer(initBuilderDraft(protocol()), {
    type: "EDIT_NAME",
    name: "Summer Split",
  });

  // Act
  const payload = toDeployPayload(draft, "kg");

  // Assert — the name travels in the deploy payload (ADR-0021)
  assert.equal(payload.name, "Summer Split");
});

test("ADD_PRESCRIPTION appends a new editable Prescription to an un-performed Session", () => {
  // Arrange — a Session with one existing Prescription
  const draft = initBuilderDraft(protocol());

  // Act — pick an Exercise from the Library to add
  const next = builderReducer(draft, {
    type: "ADD_PRESCRIPTION",
    sessionId: 1,
    exercise: { id: 200, name: "Romanian Deadlift" },
  });

  // Assert — appended at the end, carrying the picked Exercise and editable defaults
  const prescriptions = next.sessions[0].prescriptions;
  assert.equal(prescriptions.length, 2);
  const added = prescriptions[1];
  assert.equal(added.exerciseId, 200);
  assert.equal(added.exerciseName, "Romanian Deadlift");
  assert.ok(added.sets >= 1);
  assert.notEqual(added.reps, "");
  // …and the original draft is untouched (immutable)
  assert.equal(draft.sessions[0].prescriptions.length, 1);
});

test("ADD_PRESCRIPTION is a no-op on a performed Session (frozen prefix)", () => {
  // Arrange — Session 1 is performed
  const draft = initBuilderDraft(
    protocol({ sessions: [session({ session_id: 1, performed: true })] }),
  );

  // Act
  const next = builderReducer(draft, {
    type: "ADD_PRESCRIPTION",
    sessionId: 1,
    exercise: { id: 200, name: "Romanian Deadlift" },
  });

  // Assert — nothing added
  assert.deepEqual(next, draft);
});

test("REMOVE_PRESCRIPTION drops the Prescription at a position in an un-performed Session", () => {
  // Arrange — a Session with two Prescriptions
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 100, exercise_name: "Back Squat" }),
            prescription({ exercise_id: 200, exercise_name: "Leg Press" }),
          ],
        }),
      ],
    }),
  );

  // Act — drop the first
  const next = builderReducer(draft, {
    type: "REMOVE_PRESCRIPTION",
    sessionId: 1,
    position: 0,
  });

  // Assert — only the second remains; the original draft is untouched
  assert.deepEqual(
    next.sessions[0].prescriptions.map((p) => p.exerciseName),
    ["Leg Press"],
  );
  assert.equal(draft.sessions[0].prescriptions.length, 2);
});

test("REMOVE_PRESCRIPTION is a no-op on a performed Session (frozen prefix)", () => {
  const draft = initBuilderDraft(
    protocol({ sessions: [session({ session_id: 1, performed: true })] }),
  );

  const next = builderReducer(draft, {
    type: "REMOVE_PRESCRIPTION",
    sessionId: 1,
    position: 0,
  });

  assert.deepEqual(next, draft);
});

test("REORDER_PRESCRIPTION moves a Prescription to a new position", () => {
  // Arrange — three Prescriptions A, B, C
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A" }),
            prescription({ exercise_id: 2, exercise_name: "B" }),
            prescription({ exercise_id: 3, exercise_name: "C" }),
          ],
        }),
      ],
    }),
  );

  // Act — move C (index 2) to the front (index 0)
  const next = builderReducer(draft, {
    type: "REORDER_PRESCRIPTION",
    sessionId: 1,
    from: 2,
    to: 0,
  });

  // Assert — the new order is C, A, B (this is what deploy persists as position)
  assert.deepEqual(
    next.sessions[0].prescriptions.map((p) => p.exerciseName),
    ["C", "A", "B"],
  );
});

test("REORDER_PRESCRIPTION with an out-of-range index leaves the order unchanged", () => {
  const draft = initBuilderDraft(protocol());

  const next = builderReducer(draft, {
    type: "REORDER_PRESCRIPTION",
    sessionId: 1,
    from: 0,
    to: 5,
  });

  assert.deepEqual(next, draft);
});

test("a reordered un-performed Session's new order flows through to the deploy payload", () => {
  // Arrange — two Prescriptions in an un-performed Session
  const base = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A" }),
            prescription({ exercise_id: 2, exercise_name: "B" }),
          ],
        }),
      ],
    }),
  );

  // Act — swap them, then derive the tail
  const draft = builderReducer(base, {
    type: "REORDER_PRESCRIPTION",
    sessionId: 1,
    from: 0,
    to: 1,
  });
  const payload = toDeployPayload(draft, "kg");

  // Assert — the payload's prescription order (which becomes position on deploy)
  // reflects the reorder
  assert.deepEqual(
    payload.sessions[0].prescriptions.map((p) => p.exercise_id),
    [2, 1],
  );
});

// `builderMatrix` derives the builder's positional Week × session-slot overview
// (F4 Slice 4, ADR-0021): rows are weeks, cells are the Sessions occupying that
// week's slots in order — no weekday or date binding. It renders the *actual*
// per-week Session count (weeks may legitimately differ, e.g. deloads) and each
// cell carries what the overview and its navigation need.

test("builderMatrix groups Sessions into one row per week, in ascending week order", () => {
  // Arrange — a 2-week Protocol, two Sessions per week, given out of order
  const draft = initBuilderDraft(
    protocol({
      weeks: 2,
      sessions_per_week: 2,
      sessions: [
        session({ session_id: 3, week: 2, day: 1 }),
        session({ session_id: 1, week: 1, day: 1 }),
        session({ session_id: 4, week: 2, day: 2 }),
        session({ session_id: 2, week: 1, day: 2 }),
      ],
    }),
  );

  // Act
  const matrix = builderMatrix(draft);

  // Assert — two rows, weeks ascending, cells in day order within each week
  assert.deepEqual(
    matrix.rows.map((row) => row.week),
    [1, 2],
  );
  assert.deepEqual(
    matrix.rows.map((row) => row.cells.map((cell) => cell.sessionId)),
    [
      [1, 2],
      [3, 4],
    ],
  );
});

test("builderMatrix cells carry each Session's Prescription count", () => {
  // Arrange — two Sessions with differing numbers of Prescriptions
  const draft = initBuilderDraft(
    protocol({
      weeks: 1,
      sessions_per_week: 2,
      sessions: [
        session({
          session_id: 1,
          week: 1,
          day: 1,
          prescriptions: [prescription(), prescription(), prescription()],
        }),
        session({
          session_id: 2,
          week: 1,
          day: 2,
          prescriptions: [prescription()],
        }),
      ],
    }),
  );

  // Act
  const matrix = builderMatrix(draft);

  // Assert — each cell's count is the number of Prescriptions in that Session
  assert.deepEqual(
    matrix.rows[0].cells.map((cell) => cell.prescriptionCount),
    [3, 1],
  );
});

test("builderMatrix renders the real per-week Session count for uneven weeks", () => {
  // Arrange — week 1 has three Sessions, week 2 is a one-Session deload
  const draft = initBuilderDraft(
    protocol({
      weeks: 2,
      sessions_per_week: 3,
      sessions: [
        session({ session_id: 1, week: 1, day: 1 }),
        session({ session_id: 2, week: 1, day: 2 }),
        session({ session_id: 3, week: 1, day: 3 }),
        session({ session_id: 4, week: 2, day: 1 }),
      ],
    }),
  );

  // Act
  const matrix = builderMatrix(draft);

  // Assert — each row's width is the actual count, not a fixed frequency
  assert.deepEqual(
    matrix.rows.map((row) => row.cells.length),
    [3, 1],
  );
});

test("builderMatrix reports the plan's cadence as a frequency × cycle header", () => {
  // Arrange — a 6-per-week, 6-week Protocol
  const draft = initBuilderDraft(
    protocol({ weeks: 6, sessions_per_week: 6, sessions: [session()] }),
  );

  // Act
  const matrix = builderMatrix(draft);

  // Assert — the cadence header reads frequency/WK · weeks WK
  assert.equal(matrix.cadenceLabel, "6/WK · 6 WK");
});

test("builderMatrix flags each cell performed so the overview can distinguish them", () => {
  // Arrange — a performed Session followed by an un-performed one
  const draft = initBuilderDraft(
    protocol({
      weeks: 1,
      sessions_per_week: 2,
      sessions: [
        session({ session_id: 1, week: 1, day: 1, performed: true }),
        session({ session_id: 2, week: 1, day: 2, performed: false }),
      ],
    }),
  );

  // Act
  const matrix = builderMatrix(draft);

  // Assert — the performed flag rides each cell for the read/navigation surface
  assert.deepEqual(
    matrix.rows[0].cells.map((cell) => [cell.sessionId, cell.performed]),
    [
      [1, true],
      [2, false],
    ],
  );
});

// --- Slice 3: add / remove Sessions and reshape weeks / frequency (Module D) ---

test("SET_WEEKS changes the plan's week count (a soft header, ADR-0020)", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — grow the cycle to 4 weeks
  const next = builderReducer(draft, { type: "SET_WEEKS", weeks: 4 });

  // Assert — the header value changes; nothing else is touched
  assert.equal(next.weeks, 4);
  assert.equal(next.sessionsPerWeek, draft.sessionsPerWeek);
  assert.deepEqual(next.sessions, draft.sessions);
});

test("SET_SESSIONS_PER_WEEK changes the per-week frequency header", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act
  const next = builderReducer(draft, {
    type: "SET_SESSIONS_PER_WEEK",
    sessionsPerWeek: 3,
  });

  // Assert
  assert.equal(next.sessionsPerWeek, 3);
});

test("ADD_SESSION appends an empty un-performed Session slot in the given week", () => {
  // Arrange — a one-Session week-1 draft
  const draft = initBuilderDraft(protocol());

  // Act — add a new slot to week 2
  const next = builderReducer(draft, { type: "ADD_SESSION", week: 2 });

  // Assert — a new, empty, un-performed Session appears in week 2
  assert.equal(next.sessions.length, 2);
  const added = next.sessions[next.sessions.length - 1];
  assert.equal(added.week, 2);
  assert.equal(added.performed, false);
  assert.deepEqual(added.prescriptions, []);
});

test("ADD_SESSION numbers the new slot's day after the week's existing Sessions", () => {
  // Arrange — week 1 already holds one Session (day 1)
  const draft = initBuilderDraft(protocol());

  // Act — add a second Session to week 1
  const next = builderReducer(draft, { type: "ADD_SESSION", week: 1 });

  // Assert — the new slot takes day 2
  assert.equal(next.sessions[1].week, 1);
  assert.equal(next.sessions[1].day, 2);
});

test("a new Session can be filled from the Library via ADD_PRESCRIPTION", () => {
  // Arrange — add an empty slot, then pick an Exercise into it
  const added = builderReducer(initBuilderDraft(protocol()), {
    type: "ADD_SESSION",
    week: 2,
  });
  const slotId = added.sessions[added.sessions.length - 1].sessionId;

  // Act
  const filled = builderReducer(added, {
    type: "ADD_PRESCRIPTION",
    sessionId: slotId,
    exercise: { id: 200, name: "Deadlift" },
  });

  // Assert — the previously-empty slot now carries the picked movement
  const slot = filled.sessions.find((s) => s.sessionId === slotId);
  assert.equal(slot?.prescriptions.length, 1);
  assert.equal(slot?.prescriptions[0].exerciseName, "Deadlift");
});

test("REMOVE_SESSION drops an un-performed Session from the draft", () => {
  // Arrange — a two-Session draft
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({ session_id: 1, week: 1, day: 1 }),
        session({ session_id: 2, week: 2, day: 1 }),
      ],
    }),
  );

  // Act
  const next = builderReducer(draft, { type: "REMOVE_SESSION", sessionId: 2 });

  // Assert
  assert.deepEqual(
    next.sessions.map((s) => s.sessionId),
    [1],
  );
});

test("REMOVE_SESSION is a no-op on a performed Session (frozen prefix)", () => {
  // Arrange — Session 1 is performed
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({ session_id: 1, week: 1, day: 1, performed: true }),
        session({ session_id: 2, week: 2, day: 1, performed: false }),
      ],
    }),
  );

  // Act — try to remove the frozen Session
  const next = builderReducer(draft, { type: "REMOVE_SESSION", sessionId: 1 });

  // Assert — the frozen Session survives; the draft is unchanged
  assert.deepEqual(
    next.sessions.map((s) => s.sessionId),
    [1, 2],
  );
});

test("a newly-added Session deploys with a null session_id for the server to insert", () => {
  // Arrange — add a filled new slot to week 2
  const added = builderReducer(initBuilderDraft(protocol()), {
    type: "ADD_SESSION",
    week: 2,
  });
  const slotId = added.sessions[added.sessions.length - 1].sessionId;
  const filled = builderReducer(added, {
    type: "ADD_PRESCRIPTION",
    sessionId: slotId,
    exercise: { id: 200, name: "Deadlift" },
  });

  // Act
  const payload = toDeployPayload(filled, "kg");

  // Assert — the existing Session keeps its id; the new slot sends session_id null
  assert.deepEqual(
    payload.sessions.map((s) => s.session_id),
    [1, null],
  );
});

test("toDeployPayload carries the reshaped weeks and frequency header", () => {
  // Arrange — reshape both header values
  let draft = initBuilderDraft(protocol());
  draft = builderReducer(draft, { type: "SET_WEEKS", weeks: 6 });
  draft = builderReducer(draft, { type: "SET_SESSIONS_PER_WEEK", sessionsPerWeek: 4 });

  // Act
  const payload = toDeployPayload(draft, "kg");

  // Assert
  assert.equal(payload.weeks, 6);
  assert.equal(payload.sessions_per_week, 4);
});

test("toSimulatePayload previews the WHOLE plan, performed prefix included", () => {
  // Arrange — a performed Week 1 (frozen) and an un-performed Week 2. SIMULATE shows
  // the whole edited plan, so unlike DEPLOY it must not drop the performed prefix.
  const source = protocol({
    sessions: [
      session({ session_id: 1, week: 1, day: 1, performed: true }),
      session({ session_id: 2, position: 1, week: 2, day: 1, performed: false }),
    ],
  });
  const draft = initBuilderDraft(source);

  // Act
  const payload = toSimulatePayload(draft);

  // Assert — both weeks are present, in order
  assert.deepEqual(
    payload.sessions.map((s) => s.week),
    [1, 2],
  );
  assert.equal(payload.weeks, 2);
  assert.equal(payload.sessions_per_week, 1);
});

test("toSimulatePayload sends only the exercise id and set count per Prescription", () => {
  // Arrange — a Prescription the preview only needs to count and roll up by muscle
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [prescription({ exercise_id: 42, sets: 4 })],
        }),
      ],
    }),
  );

  // Act
  const payload = toSimulatePayload(draft);

  // Assert — a lean, read-only payload: no reps/rest/tempo/Load ride along
  assert.deepEqual(payload.sessions[0].prescriptions, [
    { exercise_id: 42, sets: 4 },
  ]);
});

// The F6 ADD TO PROTOCOL deep-link (Slice 7, ADR-0021): an Exercise arrives from its
// detail screen queued for placement. SEED_QUEUED_EXERCISE holds it on the draft;
// PLACE_QUEUED_EXERCISE drops it into an un-performed Session and clears the queue —
// a staged edit deployed like any other, never an immediate write (ADR-0020).

test("initBuilderDraft starts with no queued Exercise", () => {
  // Arrange / Act — a plain draft, no deep-link
  const draft = initBuilderDraft(protocol());

  // Assert — nothing queued for placement
  assert.equal(draft.queuedExercise, null);
});

test("SEED_QUEUED_EXERCISE holds the deep-linked Exercise on the draft for placement", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act — the F6 deep-link seeds the Exercise it carried
  const next = builderReducer(draft, {
    type: "SEED_QUEUED_EXERCISE",
    exercise: { id: 200, name: "Romanian Deadlift" },
  });

  // Assert — queued, and no Session touched yet (placement is a separate step)
  assert.deepEqual(next.queuedExercise, { id: 200, name: "Romanian Deadlift" });
  assert.deepEqual(next.sessions, draft.sessions);
  // …and the original draft is untouched (immutable)
  assert.equal(draft.queuedExercise, null);
});

test("PLACE_QUEUED_EXERCISE drops the queued Exercise into an un-performed Session and clears the queue", () => {
  // Arrange — a queued Exercise waiting to be placed
  const seeded = builderReducer(initBuilderDraft(protocol()), {
    type: "SEED_QUEUED_EXERCISE",
    exercise: { id: 200, name: "Romanian Deadlift" },
  });

  // Act — the user drops it into Session 1
  const next = builderReducer(seeded, {
    type: "PLACE_QUEUED_EXERCISE",
    sessionId: 1,
  });

  // Assert — appended as a new editable Prescription, and the queue is cleared
  const prescriptions = next.sessions[0].prescriptions;
  assert.equal(prescriptions.length, 2);
  const added = prescriptions[1];
  assert.equal(added.exerciseId, 200);
  assert.equal(added.exerciseName, "Romanian Deadlift");
  assert.ok(added.sets >= 1);
  assert.notEqual(added.reps, "");
  assert.equal(next.queuedExercise, null);
});

test("PLACE_QUEUED_EXERCISE is a no-op on a performed Session and keeps the queue (frozen prefix)", () => {
  // Arrange — Session 1 is performed; an Exercise is queued
  const seeded = builderReducer(
    initBuilderDraft(
      protocol({ sessions: [session({ session_id: 1, performed: true })] }),
    ),
    { type: "SEED_QUEUED_EXERCISE", exercise: { id: 200, name: "Romanian Deadlift" } },
  );

  // Act — try to drop it into the frozen Session
  const next = builderReducer(seeded, {
    type: "PLACE_QUEUED_EXERCISE",
    sessionId: 1,
  });

  // Assert — nothing placed, and the Exercise stays queued for a valid Session
  assert.deepEqual(next, seeded);
  assert.deepEqual(next.queuedExercise, { id: 200, name: "Romanian Deadlift" });
});

test("PLACE_QUEUED_EXERCISE with nothing queued is a no-op", () => {
  // Arrange — no deep-link, so nothing is queued
  const draft = initBuilderDraft(protocol());

  // Act
  const next = builderReducer(draft, {
    type: "PLACE_QUEUED_EXERCISE",
    sessionId: 1,
  });

  // Assert — the draft is untouched
  assert.deepEqual(next, draft);
});

// --- Slice 1: Supersets — a round-major grouping overlay (ADR-0023). The reducer
// groups 2+ contiguous un-performed Prescriptions into a Superset (shared group tag +
// one group-owned round-rest), keeps the tail contiguous, and lets a member's own rest
// go dormant while grouped and return on ungroup. Grouping never touches the frozen
// prefix. `supersetLayout` derives the A/B/C member badges the Builder renders.

function twoPrescriptionSession(overrides = {}) {
  return session({
    prescriptions: [
      prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
      prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
    ],
    ...overrides,
  });
}

test("initBuilderDraft reads a stored Superset grouping into the draft", () => {
  // Arrange — a Session already carrying a two-member Superset
  const source = protocol({
    sessions: [
      session({
        prescriptions: [
          prescription({ exercise_id: 1, superset_group: "1", round_rest_seconds: 120 }),
          prescription({ exercise_id: 2, superset_group: "1", round_rest_seconds: 120 }),
        ],
      }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source);

  // Assert — both members carry the shared tag and the group-owned round-rest
  const prescriptions = draft.sessions[0].prescriptions;
  assert.deepEqual(
    prescriptions.map((p) => p.supersetGroup),
    ["1", "1"],
  );
  assert.deepEqual(
    prescriptions.map((p) => p.roundRestSeconds),
    [120, 120],
  );
});

test("initBuilderDraft leaves a flat Prescription ungrouped", () => {
  // Arrange / Act — an ordinary flat Protocol
  const draft = initBuilderDraft(protocol());

  // Assert — no group tag, no round-rest
  const only = draft.sessions[0].prescriptions[0];
  assert.equal(only.supersetGroup, null);
  assert.equal(only.roundRestSeconds, null);
});

test("GROUP_WITH_NEXT groups two solo Prescriptions and seeds the round-rest from the last member's rest", () => {
  // Arrange — two solo Prescriptions (rest 60 and 75)
  const draft = initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] }));

  // Act — group the first with the next
  const next = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 0,
  });

  // Assert — both share one tag, and the round-rest seeds from the last member's rest
  const prescriptions = next.sessions[0].prescriptions;
  assert.equal(prescriptions[0].supersetGroup, prescriptions[1].supersetGroup);
  assert.notEqual(prescriptions[0].supersetGroup, null);
  assert.deepEqual(
    prescriptions.map((p) => p.roundRestSeconds),
    [75, 75],
  );
  // …and each member's own rest is preserved (dormant, not erased)
  assert.deepEqual(
    prescriptions.map((p) => p.restSeconds),
    [60, 75],
  );
  // …and the original draft is untouched (immutable)
  assert.equal(draft.sessions[0].prescriptions[0].supersetGroup, null);
});

test("UNGROUP clears the group and round-rest, restoring each member's own rest", () => {
  // Arrange — a grouped two-member Superset
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );

  // Act — ungroup it
  const next = builderReducer(grouped, {
    type: "UNGROUP",
    sessionId: 1,
    position: 0,
  });

  // Assert — no tags, no round-rest, and the dormant individual rests return intact
  const prescriptions = next.sessions[0].prescriptions;
  assert.deepEqual(
    prescriptions.map((p) => p.supersetGroup),
    [null, null],
  );
  assert.deepEqual(
    prescriptions.map((p) => p.roundRestSeconds),
    [null, null],
  );
  assert.deepEqual(
    prescriptions.map((p) => p.restSeconds),
    [60, 75],
  );
});

test("EDIT_ROUND_REST sets the round-rest on every member of the group", () => {
  // Arrange — a grouped two-member Superset
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );

  // Act — edit the group's round-rest
  const next = builderReducer(grouped, {
    type: "EDIT_ROUND_REST",
    sessionId: 1,
    position: 1,
    roundRestSeconds: 150,
  });

  // Assert — the round-rest is group-owned: both members carry the new value
  assert.deepEqual(
    next.sessions[0].prescriptions.map((p) => p.roundRestSeconds),
    [150, 150],
  );
});

test("GROUP_WITH_NEXT extends an existing Superset to a third member, keeping the round-rest", () => {
  // Arrange — three solo Prescriptions; group the first two
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
            prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
            prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 90 }),
          ],
        }),
      ],
    }),
  );
  const twoGrouped = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 0,
  });

  // Act — extend the group to include C
  const next = builderReducer(twoGrouped, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 1,
  });

  // Assert — all three share one tag and the same (preserved) round-rest
  const prescriptions = next.sessions[0].prescriptions;
  const tag = prescriptions[0].supersetGroup;
  assert.notEqual(tag, null);
  assert.deepEqual(
    prescriptions.map((p) => p.supersetGroup),
    [tag, tag, tag],
  );
  assert.deepEqual(
    prescriptions.map((p) => p.roundRestSeconds),
    [75, 75, 75],
  );
});

test("REORDER_PRESCRIPTION that would split a Superset is a no-op (contiguity preserved)", () => {
  // Arrange — a grouped [A,B] Superset followed by a solo C
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
            prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
            prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 90 }),
          ],
        }),
      ],
    }),
  );
  const grouped = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 0,
  });

  // Act — try to move C (index 2) between A and B (index 1), which would split the group
  const next = builderReducer(grouped, {
    type: "REORDER_PRESCRIPTION",
    sessionId: 1,
    from: 2,
    to: 1,
  });

  // Assert — the split is refused; order and grouping are unchanged
  assert.deepEqual(next, grouped);
});

test("REORDER_PRESCRIPTION that keeps every Superset contiguous still applies", () => {
  // Arrange — a solo A, then a grouped [B,C] Superset
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
            prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
            prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 90 }),
          ],
        }),
      ],
    }),
  );
  const grouped = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 1,
  });

  // Act — move solo A (index 0) to the end (index 2): [B,C] stays contiguous
  const next = builderReducer(grouped, {
    type: "REORDER_PRESCRIPTION",
    sessionId: 1,
    from: 0,
    to: 2,
  });

  // Assert — the reorder applied and the group is still intact and contiguous
  assert.deepEqual(
    next.sessions[0].prescriptions.map((p) => p.exerciseName),
    ["B", "C", "A"],
  );
  assert.equal(
    next.sessions[0].prescriptions[0].supersetGroup,
    next.sessions[0].prescriptions[1].supersetGroup,
  );
});

test("grouping is a no-op on a performed Session (frozen prefix)", () => {
  // Arrange — a performed two-Prescription Session
  const draft = initBuilderDraft(
    protocol({ sessions: [twoPrescriptionSession({ performed: true })] }),
  );

  // Act
  const next = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 0,
  });

  // Assert — the frozen Session is never grouped
  assert.deepEqual(next, draft);
});

test("toDeployPayload carries the Superset group tag and round-rest", () => {
  // Arrange — a grouped two-member Superset in an un-performed Session
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );

  // Act
  const payload = toDeployPayload(grouped, "kg");

  // Assert — the grouping rides through DEPLOY on both members
  const prescriptions = payload.sessions[0].prescriptions;
  assert.equal(prescriptions[0].superset_group, prescriptions[1].superset_group);
  assert.notEqual(prescriptions[0].superset_group, null);
  assert.deepEqual(
    prescriptions.map((p) => p.round_rest_seconds),
    [75, 75],
  );
});

test("supersetLayout labels a group's members A, B, C and marks its ends", () => {
  // Arrange — a solo A, then a grouped [B,C] Superset
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
            prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
            prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 90 }),
          ],
        }),
      ],
    }),
  );
  const grouped = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 1,
  });

  // Act
  const layout = supersetLayout(grouped.sessions[0].prescriptions);

  // Assert — A is solo; B and C carry member badges and mark the group's first/last
  assert.equal(layout[0].memberLabel, null);
  assert.deepEqual(
    layout.map((slot) => slot.memberLabel),
    [null, "A", "B"],
  );
  assert.deepEqual(
    layout.map((slot) => slot.isLastMember),
    [false, false, true],
  );
  // …and the group's round-rest (seeded from the last member C's rest) is surfaced
  assert.equal(layout[1].roundRestSeconds, 90);
});

// --- #215: the Builder renders a Superset as a visible bordered *container* wrapping
// its members. `supersetLayout` gains `groupSize` — the container-grouping fact the box
// needs: how many members it wraps (0 for a solo Prescription, so a solo renders outside
// any container). The A/B/C badge, first/last-member flags, and the group-owned
// round-rest already carried by the slot place the badge and the single round-rest field
// on the container. These tests cover the extension across solo / 2-member / many-member
// / mixed layouts.

test("supersetLayout reports groupSize 0 for solo Prescriptions", () => {
  // Arrange — three solo Prescriptions, none grouped
  const draft = initBuilderDraft(
    protocol({ sessions: [threePrescriptionSession()] }),
  );

  // Act
  const layout = supersetLayout(draft.sessions[0].prescriptions);

  // Assert — every solo reports a group size of 0, so it renders outside a container
  assert.deepEqual(
    layout.map((slot) => slot.groupSize),
    [0, 0, 0],
  );
});

test("supersetLayout reports groupSize 2 for both members of a pair", () => {
  // Arrange — a grouped [A,B] Superset followed by a solo C
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [threePrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );

  // Act
  const layout = supersetLayout(grouped.sessions[0].prescriptions);

  // Assert — the two members each report a size of 2; the solo reports 0
  assert.deepEqual(
    layout.map((slot) => slot.groupSize),
    [2, 2, 0],
  );
});

test("supersetLayout reports the full groupSize on every member of a many-member group", () => {
  // Arrange — group all three into one Superset (A,B → then B,C absorbs into one)
  const base = initBuilderDraft(
    protocol({ sessions: [threePrescriptionSession()] }),
  );
  const paired = builderReducer(base, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 0,
  });
  const trio = builderReducer(paired, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 1,
  });

  // Act
  const layout = supersetLayout(trio.sessions[0].prescriptions);

  // Assert — all three members report the full size of 3
  assert.deepEqual(
    layout.map((slot) => slot.groupSize),
    [3, 3, 3],
  );
  assert.deepEqual(
    layout.map((slot) => slot.memberLabel),
    ["A", "B", "C"],
  );
});

test("supersetLayout reports per-group sizes across a mixed layout", () => {
  // Arrange — [A,B] grouped, a solo C, then [D,E] grouped: two independent groups
  // separated by a solo. Positions 0-1 = group of 2, 2 = solo, 3-4 = group of 2.
  const draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: [
            prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
            prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 60 }),
            prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 60 }),
            prescription({ exercise_id: 4, exercise_name: "D", rest_seconds: 60 }),
            prescription({ exercise_id: 5, exercise_name: "E", rest_seconds: 60 }),
          ],
        }),
      ],
    }),
  );
  const first = builderReducer(draft, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 0,
  });
  const both = builderReducer(first, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 3,
  });

  // Act
  const layout = supersetLayout(both.sessions[0].prescriptions);

  // Assert — each slot reports the size of its own group; the solo reports 0. Member
  // letters restart per group, so the two boxes are self-labelled A/B independently.
  assert.deepEqual(
    layout.map((slot) => slot.groupSize),
    [2, 2, 0, 2, 2],
  );
  assert.deepEqual(
    layout.map((slot) => slot.memberLabel),
    ["A", "B", null, "A", "B"],
  );
});

// --- Slice 5: drag-to-group and drag-to-reorder in the Builder (ADR-0023, #156).
// Drag is an *enhancement* over #153's keyboard/button group/ungroup/reorder path,
// which stays as the accessibility floor. Two pure gesture events translate a drop
// into the resulting draft: `GROUP_BY_DRAG` (drop one row onto another → form/join a
// Superset) and `REORDER_BY_DRAG` (reposition a row → reorder, auto-ungrouping a
// member dragged out of its group). Contiguity is maintained where the reducer can and
// stays enforced at DEPLOY. Both no-op on the frozen (performed) prefix.

function threePrescriptionSession(overrides = {}) {
  return session({
    prescriptions: [
      prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
      prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
      prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 90 }),
    ],
    ...overrides,
  });
}

test("RESOLVE_DROP form-group: dropping one solo row onto another forms a Superset", () => {
  // Arrange — two solo Prescriptions
  const draft = initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] }));

  // Act — drag A (index 0) onto B (index 1)
  const next = builderReducer(draft, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "form-group", from: 0, to: 1 },
  });

  // Assert — both now share one Superset tag, adjacent
  const prescriptions = next.sessions[0].prescriptions;
  assert.equal(prescriptions.length, 2);
  assert.notEqual(prescriptions[0].supersetGroup, null);
  assert.equal(prescriptions[0].supersetGroup, prescriptions[1].supersetGroup);
});

test("RESOLVE_DROP join-group: dropping a solo into an existing container joins that Superset", () => {
  // Arrange — a grouped [A,B] Superset followed by a solo C
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [threePrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );
  const tag = grouped.sessions[0].prescriptions[0].supersetGroup as string;

  // Act — drag C (index 2) into the [A,B] container
  const next = builderReducer(grouped, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "join-group", from: 2, group: tag },
  });

  // Assert — all three now share the one Superset tag, still contiguous
  const prescriptions = next.sessions[0].prescriptions;
  assert.deepEqual(
    prescriptions.map((p) => p.supersetGroup),
    [tag, tag, tag],
  );
});

test("RESOLVE_DROP reorder within a group preserves the edited round-rest", () => {
  // Arrange — a two-member Superset [A,B] with an edited round-rest of 120s
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );
  const edited = builderReducer(grouped, {
    type: "EDIT_ROUND_REST",
    sessionId: 1,
    position: 1,
    roundRestSeconds: 120,
  });

  // Act — drag A (index 0) onto its co-member B (index 1), within the same box
  const next = builderReducer(edited, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "reorder", from: 0, to: 1 },
  });

  // Assert — the group is untouched: same tag and the 120s round-rest is not lost
  const prescriptions = next.sessions[0].prescriptions;
  assert.equal(prescriptions[0].supersetGroup, prescriptions[1].supersetGroup);
  assert.notEqual(prescriptions[0].supersetGroup, null);
  assert.deepEqual(
    prescriptions.map((p) => p.roundRestSeconds),
    [120, 120],
  );
});

test("RESOLVE_DROP form-group: dragging a member out of its group onto a solo forms a new pair and dissolves the leftover singleton", () => {
  // Arrange — a grouped [A,B] Superset and a solo C
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [threePrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );

  // Act — drag B (index 1) out of the [A,B] group onto solo C (index 2)
  const next = builderReducer(grouped, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "form-group", from: 1, to: 2 },
  });

  // Assert — order is [A, C, B]; A is a dissolved singleton (solo again), C and B pair
  const prescriptions = next.sessions[0].prescriptions;
  assert.deepEqual(
    prescriptions.map((p) => p.exerciseName),
    ["A", "C", "B"],
  );
  assert.equal(prescriptions[0].supersetGroup, null);
  assert.notEqual(prescriptions[1].supersetGroup, null);
  assert.equal(prescriptions[1].supersetGroup, prescriptions[2].supersetGroup);
});

test("RESOLVE_DROP reorder repositions a solo row within the Session", () => {
  // Arrange — three solo Prescriptions A, B, C
  const draft = initBuilderDraft(
    protocol({ sessions: [threePrescriptionSession()] }),
  );

  // Act — drag C (index 2) to the front (index 0)
  const next = builderReducer(draft, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "reorder", from: 2, to: 0 },
  });

  // Assert — new order C, A, B (what deploy persists as position)
  assert.deepEqual(
    next.sessions[0].prescriptions.map((p) => p.exerciseName),
    ["C", "A", "B"],
  );
});

test("RESOLVE_DROP leave-group: dragging a grouped member past a solo ungroups just that member, leaving the rest of the group intact", () => {
  // Arrange — a three-member Superset [A,B,C] followed by a solo D. (Group A+B,
  // extend to C; D stays solo.)
  const fourItemSession = session({
    prescriptions: [
      prescription({ exercise_id: 1, exercise_name: "A", rest_seconds: 60 }),
      prescription({ exercise_id: 2, exercise_name: "B", rest_seconds: 75 }),
      prescription({ exercise_id: 3, exercise_name: "C", rest_seconds: 90 }),
      prescription({ exercise_id: 4, exercise_name: "D", rest_seconds: 45 }),
    ],
  });
  const paired = builderReducer(
    initBuilderDraft(protocol({ sessions: [fourItemSession] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );
  const trio = builderReducer(paired, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 1,
  });

  // Act — drag A (index 0) out past solo D to the end (index 3)
  const next = builderReducer(trio, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "leave-group", from: 0, to: 3 },
  });

  // Assert — order [B, C, D, A]; B and C stay grouped and contiguous, A pulled out solo
  const prescriptions = next.sessions[0].prescriptions;
  assert.deepEqual(
    prescriptions.map((p) => p.exerciseName),
    ["B", "C", "D", "A"],
  );
  assert.notEqual(prescriptions[0].supersetGroup, null);
  assert.equal(prescriptions[0].supersetGroup, prescriptions[1].supersetGroup);
  assert.equal(prescriptions[2].supersetGroup, null);
  assert.equal(prescriptions[3].supersetGroup, null);
  // …and the pulled-out member's dormant round-rest is cleared
  assert.equal(prescriptions[3].roundRestSeconds, null);
});

test("RESOLVE_DROP reorder within a group keeps every member grouped and contiguous", () => {
  // Arrange — a three-member Superset [A,B,C]
  const paired = builderReducer(
    initBuilderDraft(protocol({ sessions: [threePrescriptionSession()] })),
    { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 },
  );
  const trio = builderReducer(paired, {
    type: "GROUP_WITH_NEXT",
    sessionId: 1,
    position: 1,
  });

  // Act — drag C (index 2) to the front (index 0); the group stays contiguous
  const next = builderReducer(trio, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "reorder", from: 2, to: 0 },
  });

  // Assert — order is [C, A, B] and all three remain in the one Superset
  const prescriptions = next.sessions[0].prescriptions;
  assert.deepEqual(
    prescriptions.map((p) => p.exerciseName),
    ["C", "A", "B"],
  );
  const tag = prescriptions[0].supersetGroup;
  assert.notEqual(tag, null);
  assert.deepEqual(
    prescriptions.map((p) => p.supersetGroup),
    [tag, tag, tag],
  );
});

test("a drag-formed Superset rides through toDeployPayload contiguous", () => {
  // Arrange — drag A onto B to form a group in an un-performed Session
  const grouped = builderReducer(
    initBuilderDraft(protocol({ sessions: [twoPrescriptionSession()] })),
    { type: "RESOLVE_DROP", sessionId: 1, intent: { kind: "form-group", from: 0, to: 1 } },
  );

  // Act
  const payload = toDeployPayload(grouped, "kg");

  // Assert — both members carry the shared tag and a round-rest on the deploy tail
  const prescriptions = payload.sessions[0].prescriptions;
  assert.notEqual(prescriptions[0].superset_group, null);
  assert.equal(prescriptions[0].superset_group, prescriptions[1].superset_group);
  assert.ok(prescriptions.every((p) => p.round_rest_seconds !== null));
});

// --- Slice 6: the manipulation layer's two pure modules (#217, ADR-0023). The
// drag-intent classifier maps a raw @dnd-kit drag-end (active id, over id) to a
// semantic DropIntent; the self-healing drop resolver applies an intent to a
// Prescription list with membership derived from the container boundary, so
// contiguity holds by construction (replacing the old "refuse a split" no-op).

// Build a plain DraftPrescription list (all solo) of the given names, so a resolver
// test can start from an explicit, order-visible layout.
function soloPrescriptions(...names: string[]): DraftPrescription[] {
  return initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: names.map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  ).sessions[0].prescriptions;
}

// Group positions [0..count-1] of a fresh N-solo list into one Superset by chaining
// GROUP_WITH_NEXT, returning just the resulting Prescription list.
function groupedPrescriptions(names: string[], groupCount: number): DraftPrescription[] {
  let draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: names.map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  );
  for (let position = 0; position < groupCount - 1; position += 1) {
    draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position });
  }
  return draft.sessions[0].prescriptions;
}

// classifyDrag ---------------------------------------------------------------

test("classifyDrag maps a row body dropped on another row (both solo) to a reorder", () => {
  const rows = soloPrescriptions("A", "B", "C");
  const intent = classifyDrag(rowDropId(2), rowDropId(0), rows);
  assert.deepEqual(intent, { kind: "reorder", from: 2, to: 0 });
});

test("classifyDrag maps a link chip drop to a form-group intent", () => {
  const rows = soloPrescriptions("A", "B");
  const intent = classifyDrag(rowDropId(0), chipDropId(1), rows);
  assert.deepEqual(intent, { kind: "form-group", from: 0, to: 1 });
});

test("classifyDrag maps a container box drop to a join-group intent naming the group", () => {
  // Arrange — [A,B] grouped, C solo
  const rows = groupedPrescriptions(["A", "B", "C"], 2);
  const group = rows[0].supersetGroup as string;

  // Act — drag solo C onto the [A,B] container box
  const intent = classifyDrag(rowDropId(2), boxDropId(group), rows);

  // Assert — C joins the named group
  assert.deepEqual(intent, { kind: "join-group", from: 2, group });
});

test("classifyDrag maps a grouped member dropped on a row outside its box to a leave-group", () => {
  // Arrange — [A,B] grouped, C solo
  const rows = groupedPrescriptions(["A", "B", "C"], 2);

  // Act — drag member B (index 1) onto solo C's row (index 2), outside the box
  const intent = classifyDrag(rowDropId(1), rowDropId(2), rows);

  // Assert — B leaves its group
  assert.deepEqual(intent, { kind: "leave-group", from: 1, to: 2 });
});

test("classifyDrag maps a grouped member dropped on a row inside its own box to a plain reorder", () => {
  // Arrange — [A,B,C] all one group
  const rows = groupedPrescriptions(["A", "B", "C"], 3);

  // Act — drag member C (index 2) onto member A's row (index 0), still inside the box
  const intent = classifyDrag(rowDropId(2), rowDropId(0), rows);

  // Assert — a within-group reorder, not a leave
  assert.deepEqual(intent, { kind: "reorder", from: 2, to: 0 });
});

test("classifyDrag yields no action for a malformed active id", () => {
  const rows = soloPrescriptions("A", "B");
  assert.equal(classifyDrag("row-xyz", rowDropId(1), rows), null);
});

test("classifyDrag yields no action for a malformed or absent over id", () => {
  const rows = soloPrescriptions("A", "B");
  assert.equal(classifyDrag(rowDropId(0), "grp-nope", rows), null);
  assert.equal(classifyDrag(rowDropId(0), null, rows), null);
});

test("classifyDrag yields no action when a row is dropped on itself", () => {
  const rows = soloPrescriptions("A", "B");
  assert.equal(classifyDrag(rowDropId(1), rowDropId(1), rows), null);
});

test("classifyDrag treats a drop onto a member's own container box as no action", () => {
  const rows = groupedPrescriptions(["A", "B"], 2);
  const group = rows[0].supersetGroup as string;
  // Member A dropped back onto its own box changes nothing.
  assert.equal(classifyDrag(rowDropId(0), boxDropId(group), rows), null);
});

// resolveDrop ----------------------------------------------------------------

const names = (prescriptions: DraftPrescription[]) =>
  prescriptions.map((p) => p.exerciseName);
const groups = (prescriptions: DraftPrescription[]) =>
  prescriptions.map((p) => p.supersetGroup);

// Every Superset occupies an unbroken run of positions.
function assertContiguous(prescriptions: DraftPrescription[]) {
  const seen = new Map<string, { first: number; last: number; count: number }>();
  prescriptions.forEach((p, i) => {
    if (p.supersetGroup === null) return;
    const bound = seen.get(p.supersetGroup);
    if (!bound) seen.set(p.supersetGroup, { first: i, last: i, count: 1 });
    else {
      bound.last = i;
      bound.count += 1;
    }
  });
  for (const { first, last, count } of seen.values()) {
    assert.equal(last - first + 1, count, "a Superset must stay contiguous");
  }
}

test("resolveDrop reorders among solos", () => {
  const rows = soloPrescriptions("A", "B", "C");
  const next = resolveDrop(rows, { kind: "reorder", from: 2, to: 0 });
  assert.deepEqual(names(next), ["C", "A", "B"]);
  assert.deepEqual(groups(next), [null, null, null]);
  assertContiguous(next);
});

test("resolveDrop reorders within a group and every member stays grouped", () => {
  const rows = groupedPrescriptions(["A", "B", "C"], 3);
  const tag = rows[0].supersetGroup;

  const next = resolveDrop(rows, { kind: "reorder", from: 2, to: 0 });

  assert.deepEqual(names(next), ["C", "A", "B"]);
  assert.deepEqual(groups(next), [tag, tag, tag]);
  assertContiguous(next);
});

test("resolveDrop leaves a member out of a 3-member group, keeping the rest grouped", () => {
  const rows = groupedPrescriptions(["A", "B", "C"], 3);
  const tag = rows[0].supersetGroup;

  // Drag member A out to the end (outside its box)
  const next = resolveDrop(rows, { kind: "leave-group", from: 0, to: 2 });

  assert.deepEqual(names(next), ["B", "C", "A"]);
  assert.equal(next[0].supersetGroup, tag);
  assert.equal(next[1].supersetGroup, tag);
  assert.equal(next[2].supersetGroup, null); // A pulled out, now solo
  assert.equal(next[2].roundRestSeconds, null); // its dormant round-rest cleared
  assertContiguous(next);
});

test("resolveDrop dissolves a two-member group when one member leaves", () => {
  // [A,B] grouped, C solo
  const rows = groupedPrescriptions(["A", "B", "C"], 2);

  // Drag member B out of the pair onto C's spot
  const next = resolveDrop(rows, { kind: "leave-group", from: 1, to: 2 });

  assert.deepEqual(names(next), ["A", "C", "B"]);
  assert.deepEqual(groups(next), [null, null, null]); // the pair dissolved
  assertContiguous(next);
});

test("resolveDrop forms a new Superset from a solo dropped onto a solo", () => {
  const rows = soloPrescriptions("A", "B", "C");

  const next = resolveDrop(rows, { kind: "form-group", from: 0, to: 1 });

  // A and B now share one tag, adjacent; C stays solo
  assert.notEqual(next[0].supersetGroup, null);
  assert.equal(next[0].supersetGroup, next[1].supersetGroup);
  assert.equal(next[2].supersetGroup, null);
  assertContiguous(next);
});

test("resolveDrop joins a solo into an existing group and preserves the group's round-rest", () => {
  // [A,B] grouped with an edited 120s round-rest, C solo
  let draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: ["A", "B", "C"].map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  );
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 });
  draft = builderReducer(draft, {
    type: "EDIT_ROUND_REST",
    sessionId: 1,
    position: 1,
    roundRestSeconds: 120,
  });
  const rows = draft.sessions[0].prescriptions;
  const tag = rows[0].supersetGroup as string;

  // Drag solo C into the [A,B] container
  const next = resolveDrop(rows, { kind: "join-group", from: 2, group: tag });

  // All three now carry the tag and the same 120s round-rest, still contiguous
  assert.deepEqual(
    groups(next),
    [tag, tag, tag],
  );
  assert.deepEqual(
    next.map((p) => p.roundRestSeconds),
    [120, 120, 120],
  );
  assertContiguous(next);
  // C keeps its own (now dormant) rest untouched
  const joined = next.find((p) => p.exerciseName === "C");
  assert.equal(joined?.restSeconds, 60);
});

test("resolveDrop keeps a member's own rest dormant (unchanged) when forming a group", () => {
  const rows = soloPrescriptions("A", "B");
  const next = resolveDrop(rows, { kind: "form-group", from: 0, to: 1 });
  // Own rests are preserved (dormant while grouped); the group owns a round-rest.
  assert.deepEqual(
    next.map((p) => p.restSeconds),
    [60, 60],
  );
  assert.ok(next.every((p) => p.roundRestSeconds !== null));
});

test("resolveDrop keeps every Superset contiguous when a solo is dropped between two groups", () => {
  // [A,B] group 1, [C,D] group 2, E solo
  let draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: ["A", "B", "C", "D", "E"].map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  );
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 });
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 2 });
  const rows = draft.sessions[0].prescriptions;

  // Reorder solo E (index 4) to the front (index 0)
  const next = resolveDrop(rows, { kind: "reorder", from: 4, to: 0 });

  assert.deepEqual(names(next), ["E", "A", "B", "C", "D"]);
  assertContiguous(next);
});

test("resolveDrop returns the list unchanged for an out-of-range reorder", () => {
  const rows = soloPrescriptions("A", "B");
  const next = resolveDrop(rows, { kind: "reorder", from: 0, to: 9 });
  assert.deepEqual(names(next), ["A", "B"]);
});

test("resolveDrop snaps a solo out of a group's middle instead of splitting it (self-healing)", () => {
  // Solo A, then grouped [B,C]
  let draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: ["A", "B", "C"].map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  );
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 1 });
  const rows = draft.sessions[0].prescriptions;
  const tag = rows[1].supersetGroup;

  // Drag solo A (index 0) down into the middle of [B,C] (index 1)
  const next = resolveDrop(rows, { kind: "reorder", from: 0, to: 1 });

  // A cannot wedge between B and C; it snaps just past the group, which stays intact
  assert.deepEqual(names(next), ["B", "C", "A"]);
  assert.deepEqual(groups(next), [tag, tag, null]);
  assertContiguous(next);
});

test("RESOLVE_DROP applies a classified reorder to an un-performed Session", () => {
  const draft = initBuilderDraft(
    protocol({ sessions: [threePrescriptionSession()] }),
  );
  const intent = classifyDrag(rowDropId(2), rowDropId(0), draft.sessions[0].prescriptions);
  assert.notEqual(intent, null);

  const next = builderReducer(draft, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: intent!,
  });

  assert.deepEqual(
    next.sessions[0].prescriptions.map((p) => p.exerciseName),
    ["C", "A", "B"],
  );
});

test("RESOLVE_DROP is a no-op on a performed Session (frozen prefix)", () => {
  const draft = initBuilderDraft(
    protocol({ sessions: [threePrescriptionSession({ performed: true })] }),
  );

  const next = builderReducer(draft, {
    type: "RESOLVE_DROP",
    sessionId: 1,
    intent: { kind: "reorder", from: 0, to: 2 },
  });

  assert.deepEqual(next, draft);
});

test("resolveDrop keeps a foreign group contiguous when a leaving member lands in its middle", () => {
  // [A,B] group 1, [C,D] group 2
  let draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: ["A", "B", "C", "D"].map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  );
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 });
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 2 });
  const rows = draft.sessions[0].prescriptions;

  // Drag member A out of group 1, targeting index 2 (inside group 2)
  const next = resolveDrop(rows, { kind: "leave-group", from: 0, to: 2 });

  // Group 1 dissolves (B left solo); A snaps clear of group 2, which stays intact
  assert.deepEqual(names(next), ["B", "C", "D", "A"]);
  assertContiguous(next);
  assert.equal(next[3].supersetGroup, null);
});

// --- Slice 7 (#219): escalating drag feedback view-model. `dragFeedback` turns a live
// drag (active id, over id) into the visual-state descriptor the render layer paints —
// the DragOverlay source, the reorder insertion line, the solid group drop-zones, and
// the "losing member" container. It delegates the *meaning* of the drag to `classifyDrag`
// so the feedback shown can never contradict the drop the resolver will apply (#217/#218).

test("dragFeedback puts the insertion gap below the target when reordering downward", () => {
  const rows = soloPrescriptions("A", "B", "C", "D");
  // Drag A (0) down onto C (2): A lands after C, so the line sits at the C|D boundary.
  const feedback = dragFeedback(rowDropId(0), rowDropId(2), rows);
  assert.equal(feedback?.from, 0);
  assert.equal(feedback?.insertionGap, 3);
  assert.equal(feedback?.formGroupChip, null);
  assert.equal(feedback?.joinGroup, null);
  assert.equal(feedback?.losingGroup, null);
});

test("dragFeedback puts the insertion gap at the target when reordering upward", () => {
  const rows = soloPrescriptions("A", "B", "C", "D");
  // Drag D (3) up onto B (1): D lands before B, so the line sits at the A|B boundary.
  const feedback = dragFeedback(rowDropId(3), rowDropId(1), rows);
  assert.equal(feedback?.from, 3);
  assert.equal(feedback?.insertionGap, 1);
});

test("dragFeedback yields null for a no-op drop (self, malformed, or own box)", () => {
  const solo = soloPrescriptions("A", "B");
  assert.equal(dragFeedback(rowDropId(1), rowDropId(1), solo), null); // onto self
  assert.equal(dragFeedback("row-xyz", rowDropId(0), solo), null); // malformed active
  assert.equal(dragFeedback(rowDropId(0), null, solo), null); // absent over

  const grouped = groupedPrescriptions(["A", "B"], 2);
  const group = grouped[0].supersetGroup as string;
  assert.equal(dragFeedback(rowDropId(0), boxDropId(group), grouped), null); // own box
});

test("dragFeedback lights the target link chip when forming a group, with no insertion line", () => {
  const rows = soloPrescriptions("A", "B", "C");
  // Drag A onto B's link chip → form a new Superset from the pair.
  const feedback = dragFeedback(rowDropId(0), chipDropId(1), rows);
  assert.equal(feedback?.from, 0);
  assert.equal(feedback?.formGroupChip, 1);
  assert.equal(feedback?.insertionGap, null);
  assert.equal(feedback?.joinGroup, null);
});

test("dragFeedback lights the target container box when joining a group, with no insertion line", () => {
  // [A,B] grouped, C solo
  const rows = groupedPrescriptions(["A", "B", "C"], 2);
  const group = rows[0].supersetGroup as string;
  // Drag solo C onto the [A,B] container box → join that Superset.
  const feedback = dragFeedback(rowDropId(2), boxDropId(group), rows);
  assert.equal(feedback?.from, 2);
  assert.equal(feedback?.joinGroup, group);
  assert.equal(feedback?.insertionGap, null);
  assert.equal(feedback?.formGroupChip, null);
});

test("dragFeedback marks the losing container and an insertion line when a member leaves its group", () => {
  // [A,B] grouped, C solo
  const rows = groupedPrescriptions(["A", "B", "C"], 2);
  const group = rows[0].supersetGroup as string;
  // Drag member B (1) out onto solo C's row (2), outside the box → leave-group.
  const feedback = dragFeedback(rowDropId(1), rowDropId(2), rows);
  assert.equal(feedback?.from, 1);
  assert.equal(feedback?.losingGroup, group);
  assert.equal(feedback?.insertionGap, 3); // dragging downward, lands after C
  assert.equal(feedback?.joinGroup, null);
  assert.equal(feedback?.formGroupChip, null);
});

// --- Slice 8 (#220): foreshadowing microcopy + mirrored SR announcements. `dragMicrocopy`
// turns a live drag (active id, over id) into one source with two renderings: the visible
// target-anchored `foreshadow` (also the onDragOver announcement) and the `commit`
// announcement fired onDragEnd. Both are derived from `classifyDrag`, so the words a
// sighted user reads and the words a screen-reader user hears can never disagree with the
// drop the resolver will apply (ADR-0027).

test("dragMicrocopy foreshadows a reorder with 'Move here' and commits with the moved name", () => {
  const rows = soloPrescriptions("Back Squat", "Bench Press", "Deadlift");
  // Drag Deadlift (2) up onto Back Squat (0): a plain reorder among solos.
  const copy = dragMicrocopy(rowDropId(2), rowDropId(0), rows);
  assert.equal(copy?.foreshadow, "Move here");
  assert.equal(copy?.commit, "Moved Deadlift");
});

test("dragMicrocopy names the target exercise when forming a new Superset", () => {
  const rows = soloPrescriptions("Back Squat", "Bench Press", "Deadlift");
  // Drag Back Squat (0) onto Bench Press's (1) link chip → start a group with Bench Press.
  const copy = dragMicrocopy(rowDropId(0), chipDropId(1), rows);
  assert.equal(copy?.foreshadow, "Release to start a superset with Bench Press");
  assert.equal(copy?.commit, "Started a superset with Bench Press");
});

test("dragMicrocopy names the group by its letter when joining a Superset", () => {
  // [A,B] grouped (the Session's first Superset, so "superset A"), C solo.
  const rows = groupedPrescriptions(["Row", "Curl", "Press"], 2);
  const group = rows[0].supersetGroup as string;
  // Drag solo Press (2) into the [Row,Curl] container box → join superset A.
  const copy = dragMicrocopy(rowDropId(2), boxDropId(group), rows);
  assert.equal(copy?.foreshadow, "Release to add to superset A");
  assert.equal(copy?.commit, "Added Press to superset A");
});

test("dragMicrocopy names the leaving member and its group when a member leaves", () => {
  // [A,B] grouped (superset A), C solo.
  const rows = groupedPrescriptions(["Row", "Curl", "Press"], 2);
  // Drag member Curl (1) out onto solo Press's row (2), outside the box → leave-group.
  const copy = dragMicrocopy(rowDropId(1), rowDropId(2), rows);
  assert.equal(copy?.foreshadow, "Release to remove Curl from superset A");
  assert.equal(copy?.commit, "Removed Curl from superset A");
});

test("dragMicrocopy yields null for a no-op drop (self, malformed, or own box)", () => {
  const solo = soloPrescriptions("A", "B");
  assert.equal(dragMicrocopy(rowDropId(1), rowDropId(1), solo), null); // onto self
  assert.equal(dragMicrocopy("row-xyz", rowDropId(0), solo), null); // malformed active
  assert.equal(dragMicrocopy(rowDropId(0), null, solo), null); // absent over

  const grouped = groupedPrescriptions(["A", "B"], 2);
  const group = grouped[0].supersetGroup as string;
  assert.equal(dragMicrocopy(rowDropId(0), boxDropId(group), grouped), null); // own box
});

test("dragMicrocopy letters the second Superset 'B', disambiguating groups by order", () => {
  // [A,B] group 1 (superset A), [C,D] group 2 (superset B), E solo.
  let draft = initBuilderDraft(
    protocol({
      sessions: [
        session({
          prescriptions: ["A", "B", "C", "D", "E"].map((name, index) =>
            prescription({ exercise_id: index + 1, exercise_name: name, rest_seconds: 60 }),
          ),
        }),
      ],
    }),
  );
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 0 });
  draft = builderReducer(draft, { type: "GROUP_WITH_NEXT", sessionId: 1, position: 2 });
  const rows = draft.sessions[0].prescriptions;
  const secondGroup = rows[2].supersetGroup as string;

  // Drag solo E (4) into the second container → it is named "superset B", not "A".
  const copy = dragMicrocopy(rowDropId(4), boxDropId(secondGroup), rows);
  assert.equal(copy?.foreshadow, "Release to add to superset B");
  assert.equal(copy?.commit, "Added E to superset B");
});

test("dragMicrocopy keeps the foreshadow and commit renderings in sync from one source", () => {
  // [Row,Curl] grouped (superset A), Press solo. Every intent's two renderings are built
  // from the same resolved names, so the member and group letter agree across both.
  const rows = groupedPrescriptions(["Row", "Curl", "Press"], 2);
  const group = rows[0].supersetGroup as string;

  const join = dragMicrocopy(rowDropId(2), boxDropId(group), rows);
  // The group letter that foreshadows the join is the same one the commit confirms.
  assert.ok(join?.foreshadow.includes("superset A"));
  assert.ok(join?.commit.includes("superset A"));

  const leave = dragMicrocopy(rowDropId(1), rowDropId(2), rows);
  // The member named before release is the same member named on commit.
  assert.ok(leave?.foreshadow.includes("Curl"));
  assert.ok(leave?.commit.includes("Curl"));
  assert.ok(leave?.foreshadow.includes("superset A"));
  assert.ok(leave?.commit.includes("superset A"));
});
