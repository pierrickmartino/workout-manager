import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initBuilderDraft,
  builderReducer,
  toDeployPayload,
} from "./protocol-builder.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// The Builder sets a Session's Training Type and duration (#707, ADR-0020 amendment). A
// draft Session carries the values the server read for it; a new slot starts from the
// Protocol's; the reducer edits them only on an un-performed Session; and DEPLOY always
// sends what the Builder shows, so what the user sees is what is persisted.

function session(overrides = {}) {
  return {
    session_id: 1,
    position: 0,
    week: 1,
    day: 1,
    title: null,
    training_type: "strength",
    duration_minutes: 45,
    performed: false,
    logged_session_id: null,
    prescriptions: [],
    ...overrides,
  };
}

function protocol(overrides = {}): ProtocolProgress {
  return {
    id: 7,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "gain muscle mass",
    sessions_per_week: 2,
    weeks: 1,
    duration_minutes: 45,
    name: null,
    label: "gain muscle mass · strength",
    completed_count: 0,
    next_session: null,
    calibration: 0,
    calibration_min: -3,
    calibration_max: 3,
    sessions: [session()],
    ...overrides,
  } as ProtocolProgress;
}

test("initBuilderDraft reads each Session's own Training Type and duration", () => {
  // Arrange — a run day typed apart from its strength Protocol
  const source = protocol({
    sessions: [
      session(),
      session({ session_id: 2, day: 2, training_type: "cardio", duration_minutes: 35 }),
    ],
  });

  // Act
  const draft = initBuilderDraft(source);

  // Assert
  assert.deepEqual(
    draft.sessions.map((s) => [s.trainingType, s.durationMinutes]),
    [
      ["strength", 45],
      ["cardio", 35],
    ],
  );
});

test("ADD_SESSION seeds a new slot with the Protocol's Training Type and duration", () => {
  // Arrange — the Protocol's own values, even when its last Session differs
  const draft = initBuilderDraft(
    protocol({ sessions: [session({ training_type: "cardio", duration_minutes: 35 })] }),
  );

  // Act
  const next = builderReducer(draft, { type: "ADD_SESSION", week: 1 });

  // Assert
  const added = next.sessions[next.sessions.length - 1];
  assert.equal(added.trainingType, "strength");
  assert.equal(added.durationMinutes, 45);
});

test("SET_SESSION_TRAINING_TYPE retypes an un-performed Session and leaves its duration", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act
  const next = builderReducer(draft, {
    type: "SET_SESSION_TRAINING_TYPE",
    sessionId: 1,
    trainingType: "cardio",
  });

  // Assert — switching the type never guesses a new duration
  assert.equal(next.sessions[0].trainingType, "cardio");
  assert.equal(next.sessions[0].durationMinutes, 45);
  assert.equal(draft.sessions[0].trainingType, "strength");
});

test("SET_SESSION_DURATION sets an un-performed Session's minutes", () => {
  // Arrange
  const draft = initBuilderDraft(protocol());

  // Act
  const next = builderReducer(draft, {
    type: "SET_SESSION_DURATION",
    sessionId: 1,
    durationMinutes: 30,
  });

  // Assert
  assert.equal(next.sessions[0].durationMinutes, 30);
});

test("a performed Session's Training Type and duration are frozen", () => {
  // Arrange
  const draft = initBuilderDraft(protocol({ sessions: [session({ performed: true })] }));

  // Act
  const retyped = builderReducer(draft, {
    type: "SET_SESSION_TRAINING_TYPE",
    sessionId: 1,
    trainingType: "yoga",
  });
  const resized = builderReducer(retyped, {
    type: "SET_SESSION_DURATION",
    sessionId: 1,
    durationMinutes: 10,
  });

  // Assert
  assert.equal(resized.sessions[0].trainingType, "strength");
  assert.equal(resized.sessions[0].durationMinutes, 45);
});

test("toDeployPayload always sends each Session's Training Type and duration", () => {
  // Arrange — an edited existing Session and a fresh slot left at its seeded values
  const added = builderReducer(initBuilderDraft(protocol()), { type: "ADD_SESSION", week: 1 });
  const draft = builderReducer(added, {
    type: "SET_SESSION_TRAINING_TYPE",
    sessionId: 1,
    trainingType: "mobility",
  });

  // Act
  const payload = toDeployPayload(draft, "kg");

  // Assert
  assert.deepEqual(
    payload.sessions.map((s) => [s.session_id, s.training_type, s.duration_minutes]),
    [
      [1, "mobility", 45],
      [null, "strength", 45],
    ],
  );
});
