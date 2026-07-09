import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initBuilderDraft,
  builderReducer,
  toDeployPayload,
} from "./protocol-builder.ts";
import type { BuilderDraft } from "./protocol-builder.ts";
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
  const payload = toDeployPayload(draft);

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
  const payload = toDeployPayload(draft);

  // Assert — the payload's prescription order (which becomes position on deploy)
  // reflects the reorder
  assert.deepEqual(
    payload.sessions[0].prescriptions.map((p) => p.exercise_id),
    [2, 1],
  );
});
