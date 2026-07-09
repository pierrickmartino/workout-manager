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
