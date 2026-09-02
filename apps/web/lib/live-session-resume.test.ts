import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initLiveSession,
  liveSessionReducer,
  resolveLiveEntry,
  ownsLiveSlot,
  IDLE_TIMEOUT_MS,
} from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// Resume, idle auto-end, single-session enforcement (issue #91 — F2·S6), and
// account-scoping (issue #411 — ADR-0059). The engine decides what happens when the
// user returns to the live route from a single persisted `localStorage` slot (ADR-0012
// ephemeral/localStorage; ADR-0014 idle auto-end): begin fresh, resume, auto-end as
// Incomplete, block a second start, or purge a slot owned by another account.

// The signed-in Clerk account the persisted performances below are stamped with; a
// different id models another user on a shared browser profile.
const ACCOUNT = "user_1";
const OTHER_ACCOUNT = "user_2";

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

// An in-progress Live Session for SESSION, started at START and owned by ACCOUNT
// (so last-activity is START unless moved).
function inProgress(): LiveSessionState {
  return liveSessionReducer(initLiveSession(SESSION, "kg"), {
    type: "START",
    now: START,
    accountId: ACCOUNT,
  });
}

test("resolveLiveEntry begins fresh when no session is persisted", () => {
  // Arrange — an empty slot (no in-progress performance)
  // Act
  const entry = resolveLiveEntry(null, SESSION.id, START, ACCOUNT);

  // Assert — nothing to resume, so this Session starts fresh
  assert.deepEqual(entry, { kind: "start_fresh" });
});

test("resolveLiveEntry begins fresh when the persisted session is already finished", () => {
  // Arrange — a slot left holding a finished performance (not yet cleared)
  const finished = liveSessionReducer(inProgress(), { type: "FINISH" });

  // Act / Assert — a finished performance is not resumable; start fresh
  assert.deepEqual(resolveLiveEntry(finished, SESSION.id, START, ACCOUNT), {
    kind: "start_fresh",
  });
});

test("resolveLiveEntry resumes an unfinished session returned to within the idle window", () => {
  // Arrange — last activity at START, returning 10 minutes later (well inside 30)
  const stored = inProgress();
  const now = START + 10 * 60 * 1000;

  // Act
  const entry = resolveLiveEntry(stored, SESSION.id, now, ACCOUNT);

  // Assert — resume, carrying the exact persisted state (set table, current set,
  // timestamps backing the elapsed timer)
  assert.deepEqual(entry, { kind: "resume", state: stored });
});

test("resolveLiveEntry resumes at exactly the 30-minute boundary (gap is not yet past the cap)", () => {
  // Arrange — the idle gap equals the cap precisely; the rule is *strictly* greater
  const stored = inProgress();
  const now = START + IDLE_TIMEOUT_MS;

  // Act / Assert — 30 minutes exactly still resumes (> is the auto-end trigger)
  assert.deepEqual(resolveLiveEntry(stored, SESSION.id, now, ACCOUNT), {
    kind: "resume",
    state: stored,
  });
});

test("resolveLiveEntry auto-ends an unfinished session idle past the 30-minute cap", () => {
  // Arrange — one millisecond past the cap
  const stored = inProgress();
  const now = START + IDLE_TIMEOUT_MS + 1;

  // Act
  const entry = resolveLiveEntry(stored, SESSION.id, now, ACCOUNT);

  // Assert — auto-end as Incomplete on this foreground (ADR-0014), carrying the
  // state to finalize (completed sets written, idle-excluded duration)
  assert.deepEqual(entry, { kind: "auto_end", state: stored });
});

test("resolveLiveEntry blocks starting a different session while one is unfinished", () => {
  // Arrange — an unfinished performance of Session 42, arriving at Session 99's live route
  const stored = inProgress();

  // Act
  const entry = resolveLiveEntry(stored, 99, START + 1000, ACCOUNT);

  // Assert — blocked with the existing performance to resume or end; no work discarded
  assert.deepEqual(entry, { kind: "blocked", existing: stored });
});

test("resolveLiveEntry blocks a different unfinished session even when it is idle-expired", () => {
  // Arrange — the stored performance is stale, but it is a *different* Session, so
  // enforcement (resume-or-end that one) takes precedence over auto-ending it here.
  const stored = inProgress();
  const now = START + IDLE_TIMEOUT_MS + 60_000;

  // Act / Assert
  assert.deepEqual(resolveLiveEntry(stored, 99, now, ACCOUNT), {
    kind: "blocked",
    existing: stored,
  });
});

// --- Account-scoping (issue #411 — ADR-0059, amending ADR-0035) ---

test("resolveLiveEntry purges a slot owned by a different account", () => {
  // Arrange — account A's unfinished slot, arrived at by account B on a shared browser
  const stored = inProgress();

  // Act
  const entry = resolveLiveEntry(stored, SESSION.id, START + 1000, OTHER_ACCOUNT);

  // Assert — B is never offered A's workout; the slot is purged and B starts fresh
  assert.deepEqual(entry, { kind: "purge" });
});

test("resolveLiveEntry purges a foreign slot ahead of the single-session block", () => {
  // Arrange — account A's slot for Session 42, account B arriving at Session 99's route.
  // Ownership is checked before session enforcement, so B is not blocked by A's work.
  const stored = inProgress();

  // Act / Assert — foreign wins over "different session" — purge, not blocked
  assert.deepEqual(resolveLiveEntry(stored, 99, START + 1000, OTHER_ACCOUNT), {
    kind: "purge",
  });
});

test("resolveLiveEntry purges an ownerless (legacy) slot", () => {
  // Arrange — a slot with no owner. In the wired path a legacy pre-#411 slot is
  // rejected one layer earlier by the structural guard (`isLiveSessionState` requires
  // an accountId, so `readLiveSessionSlot` returns null → start fresh, the same outcome
  // as any invalid slot). This asserts the pure gate's own defense-in-depth: reached
  // an ownerless slot directly, it still refuses to resume it (ADR-0059).
  const legacy: LiveSessionState = { ...inProgress(), accountId: null };

  // Act / Assert — an ownerless slot is treated as foreign and purged
  assert.deepEqual(resolveLiveEntry(legacy, SESSION.id, START + 1000, ACCOUNT), {
    kind: "purge",
  });
});

test("resolveLiveEntry purges when no account is signed in (no resume for an anonymous read)", () => {
  // Arrange — a valid owned slot, but the current user is not yet known
  const stored = inProgress();

  // Act / Assert — ownership cannot be confirmed, so nothing is resumed
  assert.deepEqual(resolveLiveEntry(stored, SESSION.id, START + 1000, null), {
    kind: "purge",
  });
});

test("resolveLiveEntry resumes an abandoned same-account slot — no client-side hard expiry", () => {
  // Arrange — the owner's own slot, untouched for hours (well past any idle notion),
  // but still within a *timed* idle window is auto-ended; here it is untimed so the
  // stale-but-owned slot simply resumes. There is no ownership-driven expiry (ADR-0059).
  const stored: LiveSessionState = { ...inProgress(), lastActivityAt: null };
  const muchLater = START + 6 * 60 * 60 * 1000;

  // Act / Assert — the owner always gets their abandoned slot back
  assert.deepEqual(resolveLiveEntry(stored, SESSION.id, muchLater, ACCOUNT), {
    kind: "resume",
    state: stored,
  });
});

test("ownsLiveSlot is true only for the signed-in owner's slot", () => {
  const stored = inProgress();

  // The owner claims it — regardless of how stale (the Home banner offers it on this)
  assert.equal(ownsLiveSlot(stored, ACCOUNT), true);
  // A different account, a legacy id-less slot, an empty slot, and an anonymous read
  // all read as "not mine".
  assert.equal(ownsLiveSlot(stored, OTHER_ACCOUNT), false);
  assert.equal(ownsLiveSlot({ ...stored, accountId: null }, ACCOUNT), false);
  assert.equal(ownsLiveSlot(null, ACCOUNT), false);
  assert.equal(ownsLiveSlot(stored, null), false);
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
