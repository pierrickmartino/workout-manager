import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initLiveSession,
  liveSessionReducer,
  resolveLiveEntry,
  IDLE_TIMEOUT_MS,
} from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// Resume, idle auto-end, and single-session enforcement (issue #91 — F2·S6). The
// engine decides what happens when the user returns to the live route from a single
// persisted `localStorage` slot (ADR-0012 ephemeral/localStorage; ADR-0014 idle
// auto-end): begin fresh, resume, auto-end as Incomplete, or block a second start.

const SESSION: WorkoutSession = {
  id: 42,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 2,
      reps: "8-12",
      rest_seconds: 90,
      tempo: null,
      recommended_load: { kind: "absolute", text: "70 kg", kg: 70 },
      exercise_id: 100,
      exercise_name: "Back Squat",
      exercise_description: null,
      targeted_muscles: ["quads"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
  ],
};

const START = 1_000_000;

// An in-progress Live Session for SESSION, started at START with its first set
// completed at `START` (so last-activity is START unless moved).
function inProgress(): LiveSessionState {
  return liveSessionReducer(initLiveSession(SESSION, "kg"), {
    type: "START",
    now: START,
  });
}

test("resolveLiveEntry begins fresh when no session is persisted", () => {
  // Arrange — an empty slot (no in-progress performance)
  // Act
  const entry = resolveLiveEntry(null, SESSION.id, START);

  // Assert — nothing to resume, so this Session starts fresh
  assert.deepEqual(entry, { kind: "start_fresh" });
});

test("resolveLiveEntry begins fresh when the persisted session is already finished", () => {
  // Arrange — a slot left holding a finished performance (not yet cleared)
  const finished = liveSessionReducer(inProgress(), { type: "FINISH" });

  // Act / Assert — a finished performance is not resumable; start fresh
  assert.deepEqual(resolveLiveEntry(finished, SESSION.id, START), {
    kind: "start_fresh",
  });
});

test("resolveLiveEntry resumes an unfinished session returned to within the idle window", () => {
  // Arrange — last activity at START, returning 10 minutes later (well inside 30)
  const stored = inProgress();
  const now = START + 10 * 60 * 1000;

  // Act
  const entry = resolveLiveEntry(stored, SESSION.id, now);

  // Assert — resume, carrying the exact persisted state (set table, current set,
  // timestamps backing the elapsed timer)
  assert.deepEqual(entry, { kind: "resume", state: stored });
});

test("resolveLiveEntry resumes at exactly the 30-minute boundary (gap is not yet past the cap)", () => {
  // Arrange — the idle gap equals the cap precisely; the rule is *strictly* greater
  const stored = inProgress();
  const now = START + IDLE_TIMEOUT_MS;

  // Act / Assert — 30 minutes exactly still resumes (> is the auto-end trigger)
  assert.deepEqual(resolveLiveEntry(stored, SESSION.id, now), {
    kind: "resume",
    state: stored,
  });
});

test("resolveLiveEntry auto-ends an unfinished session idle past the 30-minute cap", () => {
  // Arrange — one millisecond past the cap
  const stored = inProgress();
  const now = START + IDLE_TIMEOUT_MS + 1;

  // Act
  const entry = resolveLiveEntry(stored, SESSION.id, now);

  // Assert — auto-end as Incomplete on this foreground (ADR-0014), carrying the
  // state to finalize (completed sets written, idle-excluded duration)
  assert.deepEqual(entry, { kind: "auto_end", state: stored });
});

test("resolveLiveEntry blocks starting a different session while one is unfinished", () => {
  // Arrange — an unfinished performance of Session 42, arriving at Session 99's live route
  const stored = inProgress();

  // Act
  const entry = resolveLiveEntry(stored, 99, START + 1000);

  // Assert — blocked with the existing performance to resume or end; no work discarded
  assert.deepEqual(entry, { kind: "blocked", existing: stored });
});

test("resolveLiveEntry blocks a different unfinished session even when it is idle-expired", () => {
  // Arrange — the stored performance is stale, but it is a *different* Session, so
  // enforcement (resume-or-end that one) takes precedence over auto-ending it here.
  const stored = inProgress();
  const now = START + IDLE_TIMEOUT_MS + 60_000;

  // Act / Assert
  assert.deepEqual(resolveLiveEntry(stored, 99, now), {
    kind: "blocked",
    existing: stored,
  });
});

test("HYDRATE restores a persisted state wholesale, replacing the current one", () => {
  // Arrange — a fresh not-started state, and a persisted mid-performance snapshot
  const fresh = initLiveSession(SESSION, "kg");
  const stored = liveSessionReducer(inProgress(), {
    type: "COMPLETE_SET",
    index: 0,
    reps: 9,
    loadKind: "absolute",
    loadValue: "72.5",
    rpe: 8,
    now: START + 40_000,
  });

  // Act — hydrate the fresh reducer with the stored snapshot
  const hydrated = liveSessionReducer(fresh, { type: "HYDRATE", state: stored });

  // Assert — the restored state is exactly the persisted one (set table, current
  // set pointer, timestamps), not the fresh init
  assert.deepEqual(hydrated, stored);
  assert.equal(hydrated.sets[0].status, "completed");
  assert.equal(hydrated.currentIndex, 1);
  assert.equal(hydrated.lastActivityAt, START + 40_000);
});
