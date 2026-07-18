import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initBuilderDraft,
  builderReducer,
  builderMatrix,
  supersetLayout,
  toDeployPayload,
  toSimulatePayload,
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
  const payload = toDeployPayload(draft);

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
  const payload = toDeployPayload(draft);

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
  const payload = toDeployPayload(filled);

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
  const payload = toDeployPayload(draft);

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
  const payload = toDeployPayload(grouped);

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
