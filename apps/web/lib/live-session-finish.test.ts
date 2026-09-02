import { test } from "node:test";
import assert from "node:assert/strict";

import { initLiveSession, liveSessionReducer } from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import {
  decideFinishOutcome,
  resolveFinishKey,
  stampFinishKey,
  stampWithFreshKey,
  FINISH_UNREACHABLE_MESSAGE,
} from "./live-session-finish.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// The finish is duplicate-safe (issue #412 — ADR-0060): a stable client-minted key is
// resent on every retry so the server dedupes it to one Logged Session, and the slot
// is cleared only on an acknowledged success — a failed finish keeps it for the retry.

const SESSION: WorkoutSession = {
  id: 7,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 30,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 1,
      reps: "5",
      rest_seconds: 90,
      tempo: null,
      recommended_load: null,
      exercise_id: 100,
      exercise_name: "Back Squat",
      exercise_description: null,
      targeted_muscles: ["quads"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
  ],
};

function started(key: string | null): LiveSessionState {
  const base = liveSessionReducer(initLiveSession(SESSION, "kg"), {
    type: "START",
    now: 1_000_000,
    accountId: "user_1",
  });
  return { ...base, idempotencyKey: key };
}

test("resolveFinishKey mints a fresh key when none is stamped yet", () => {
  // Arrange — a performance without a key (started before this shipped)
  const mint = () => "minted-key";

  // Act
  const key = resolveFinishKey(null, mint);

  // Assert — a first finish gets a newly minted key
  assert.equal(key, "minted-key");
});

test("resolveFinishKey reuses the stamped key so a retry resends the same one", () => {
  // Arrange — a key already minted on a prior attempt; the mint must NOT be called
  const mint = () => assert.fail("must not mint when a key already exists");

  // Act
  const key = resolveFinishKey("existing-key", mint);

  // Assert — the retry reuses the same key, which the server dedupes on
  assert.equal(key, "existing-key");
});

test("resolveFinishKey treats an empty string as no key and mints", () => {
  // Arrange
  const mint = () => "minted-key";

  // Act / Assert — a blank key is not a usable identity
  assert.equal(resolveFinishKey("", mint), "minted-key");
});

test("stampFinishKey returns a new state carrying the key, never mutating the input", () => {
  // Arrange
  const before = started(null);

  // Act
  const after = stampFinishKey(before, "the-key");

  // Assert — the key rides on the copy; the original is untouched (immutability)
  assert.equal(after.idempotencyKey, "the-key");
  assert.equal(before.idempotencyKey, null);
  assert.notEqual(after, before);
});

test("stampWithFreshKey mints and stamps a key for an unkeyed performance", () => {
  // Arrange — a performance with no key yet
  const before = started(null);

  // Act
  const after = stampWithFreshKey(before, () => "minted-key");

  // Assert — the minted key is stamped on the copy; the input is untouched
  assert.equal(after.idempotencyKey, "minted-key");
  assert.equal(before.idempotencyKey, null);
});

test("stampWithFreshKey reuses an already-stamped key so a retry resends it", () => {
  // Arrange — a performance already carrying a key (a prior attempt)
  const before = started("existing-key");
  const mint = () => assert.fail("must not mint when a key already exists");

  // Act
  const after = stampWithFreshKey(before, mint);

  // Assert — the same key rides on the result
  assert.equal(after.idempotencyKey, "existing-key");
});

test("decideFinishOutcome clears the slot on an acknowledged success", () => {
  // Act
  const outcome = decideFinishOutcome({ status: "acknowledged" });

  // Assert — only an acknowledged write releases the slot
  assert.deepEqual(outcome, { kind: "clear" });
});

test("decideFinishOutcome retains the slot and surfaces a server error", () => {
  // Act
  const outcome = decideFinishOutcome({ status: "error", message: "Boom." });

  // Assert — the work stays for a retry, with the server's message
  assert.deepEqual(outcome, { kind: "retain", error: "Boom." });
});

test("decideFinishOutcome retains the slot with a reassuring offline message", () => {
  // Act — the request never reached the server (offline / dropped connection)
  const outcome = decideFinishOutcome({ status: "unreachable" });

  // Assert — the session is kept locally and a retry is offered
  assert.deepEqual(outcome, {
    kind: "retain",
    error: FINISH_UNREACHABLE_MESSAGE,
  });
});
