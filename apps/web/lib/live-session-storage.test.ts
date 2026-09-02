import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_SESSION_SLOT_KEY,
  saveLiveSession,
  loadLiveSession,
  clearLiveSession,
  type SlotStorage,
} from "./live-session-storage.ts";
import {
  initLiveSession,
  liveSessionReducer,
} from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// Single-slot `localStorage` persistence for the Live Session (issue #91 — F2·S6,
// ADR-0012). At most one performance is ever stored, so the whole engine state
// round-trips through one key. Stored data is never trusted: a malformed or
// stale-shaped slot deserializes to null (falling back to a fresh start), never a
// throw. The logic takes an injected Storage so it is testable without a DOM.

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

// A Map-backed fake of the injected Storage subset.
function fakeStorage(): SlotStorage & { size: () => number } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    size: () => map.size,
  };
}

function inProgress(): LiveSessionState {
  return liveSessionReducer(initLiveSession(SESSION, "kg"), {
    type: "START",
    now: 1_000_000,
    accountId: "user_1",
  });
}

test("saveLiveSession then loadLiveSession round-trips the state unchanged", () => {
  // Arrange — a mid-performance state (first set completed)
  const storage = fakeStorage();
  const state = liveSessionReducer(inProgress(), {
    type: "COMPLETE_SET",
    index: 0,
    reps: 9,
    loadKind: "absolute",
    loadValue: "72.5",
    rpe: 8,
    now: 1_040_000,
  });

  // Act
  saveLiveSession(storage, state);
  const loaded = loadLiveSession(storage);

  // Assert — the exact same state comes back
  assert.deepEqual(loaded, state);
});

test("loadLiveSession returns null when the slot is empty", () => {
  const storage = fakeStorage();
  assert.equal(loadLiveSession(storage), null);
});

test("loadLiveSession returns null for malformed JSON rather than throwing", () => {
  // Arrange — a corrupt slot
  const storage = fakeStorage();
  storage.setItem(LIVE_SESSION_SLOT_KEY, "{not json");

  // Act / Assert — never trust stored data: a parse failure falls back to empty
  assert.equal(loadLiveSession(storage), null);
});

test("loadLiveSession returns null for a well-formed but wrong-shaped slot", () => {
  // Arrange — valid JSON that is not a Live Session state (e.g. a stale schema)
  const storage = fakeStorage();
  storage.setItem(LIVE_SESSION_SLOT_KEY, JSON.stringify({ foo: "bar" }));

  // Act / Assert
  assert.equal(loadLiveSession(storage), null);
});

test("loadLiveSession rejects a legacy slot missing the Superset overlay fields", () => {
  // Arrange — a slot in the pre-#161 shape: a solo set with `moduleIndex` but
  // none of the Superset-overlay fields (unitIndex/supersetLabel/restsAfter…).
  // Hydrating it would render "SUPERSET undefined" and suppress rest timers.
  const storage = fakeStorage();
  const legacySet = {
    exerciseId: 100,
    exerciseName: "Back Squat",
    moduleIndex: 0,
    setNumber: 1,
    status: "pending",
  };
  storage.setItem(
    LIVE_SESSION_SLOT_KEY,
    JSON.stringify({
      sessionId: 42,
      currentIndex: 0,
      status: "in_progress",
      startedAt: 1_000_000,
      lastActivityAt: 1_000_000,
      sets: [legacySet],
    }),
  );

  // Act / Assert — the stale-shaped slot is rejected, so the caller starts fresh
  assert.equal(loadLiveSession(storage), null);
});

test("saveLiveSession persists the owner's account id", () => {
  // Arrange / Act — a slot stamped with its owner (ADR-0059) round-trips its id
  const storage = fakeStorage();
  saveLiveSession(storage, inProgress());

  // Assert — the persisted slot carries who it belongs to
  assert.equal(loadLiveSession(storage)?.accountId, "user_1");
});

test("loadLiveSession rejects a legacy slot with no account id", () => {
  // Arrange — a slot in the pre-#411 shape: otherwise well-formed, but no owner. Rather
  // than guess an owner, hydration rejects it — the same "start fresh" outcome as any
  // structurally invalid slot (ADR-0059), so a legacy slot is never mis-attributed.
  const storage = fakeStorage();
  const ownerless: Record<string, unknown> = { ...inProgress() };
  delete ownerless.accountId;
  storage.setItem(LIVE_SESSION_SLOT_KEY, JSON.stringify(ownerless));

  // Act / Assert
  assert.equal(loadLiveSession(storage), null);
});

test("loadLiveSession rejects a slot whose account id is not a string", () => {
  // Arrange — a tampered/foreign-shaped slot with a non-string owner
  const storage = fakeStorage();
  storage.setItem(
    LIVE_SESSION_SLOT_KEY,
    JSON.stringify({ ...inProgress(), accountId: 12345 }),
  );

  // Act / Assert — the malformed owner is rejected, not coerced
  assert.equal(loadLiveSession(storage), null);
});

test("clearLiveSession empties the slot", () => {
  // Arrange
  const storage = fakeStorage();
  saveLiveSession(storage, inProgress());

  // Act
  clearLiveSession(storage);

  // Assert — the slot is gone
  assert.equal(loadLiveSession(storage), null);
  assert.equal(storage.size(), 0);
});

test("saveLiveSession keeps a single slot — a second save overwrites the first", () => {
  // Arrange — one slot only (ADR-0012)
  const storage = fakeStorage();
  saveLiveSession(storage, inProgress());
  const advanced = liveSessionReducer(inProgress(), { type: "ADVANCE" });

  // Act — save a second state
  saveLiveSession(storage, advanced);

  // Assert — still exactly one key, holding the latest state
  assert.equal(storage.size(), 1);
  assert.deepEqual(loadLiveSession(storage), advanced);
});
