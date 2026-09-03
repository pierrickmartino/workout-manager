import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildOutboxEntry,
  enqueue,
  markSyncing,
  markSynced,
  markFailed,
  retry,
  retryAll,
  entriesForAccount,
  hasEntry,
  hasForeignEntries,
  type OutboxEntry,
} from "./finish-outbox.ts";
import type { LogSessionInput } from "./logs-types.ts";

// A minimal well-formed finish payload; its contents don't matter to the reducer,
// only that the entry carries one. The idempotency_key mirrors the entry key.
function payload(key: string): LogSessionInput {
  return {
    performed_on: "2026-09-02",
    completion_outcome: "completed",
    duration_seconds: 600,
    idempotency_key: key,
    logged_sets: [
      {
        exercise_id: 1,
        quantity_kind: "repetitions",
        quantity_value: "5",
        load_kind: "absolute",
        load_value: "100",
        perceived_difficulty: null,
      },
    ],
  };
}

// Build a pending entry the way the finish flow would. `enqueue` normalizes status
// and error, so callers can hand a freshly-built entry.
function entry(
  key: string,
  accountId: string,
  sessionId = 7,
): OutboxEntry {
  return {
    key,
    accountId,
    sessionId,
    payload: payload(key),
    status: "pending",
    error: null,
  };
}

test("buildOutboxEntry constructs a pending entry keyed by the payload's idempotency key", () => {
  // Arrange
  const p = payload("mint-1");

  // Act
  const built = buildOutboxEntry("acct-a", 42, p);

  // Assert
  assert.deepEqual(built, {
    key: "mint-1",
    accountId: "acct-a",
    sessionId: 42,
    payload: p,
    status: "pending",
    error: null,
  });
});

test("buildOutboxEntry returns null for a payload with no idempotency key", () => {
  // Arrange — a keyless payload cannot be delivered idempotently, so it is not queued.
  const keyless: LogSessionInput = { ...payload("x"), idempotency_key: null };

  // Act & Assert
  assert.equal(buildOutboxEntry("acct-a", 42, keyless), null);
});

test("enqueue appends a normalized pending entry to an empty outbox", () => {
  // Arrange
  const built: OutboxEntry = { ...entry("k1", "acct-a"), status: "failed", error: "stale" };

  // Act
  const next = enqueue([], built);

  // Assert — the new finish is queued as pending with a cleared error, whatever the
  // caller passed, so a brand-new enqueue never inherits a stray failed state.
  assert.equal(next.length, 1);
  assert.equal(next[0].key, "k1");
  assert.equal(next[0].status, "pending");
  assert.equal(next[0].error, null);
});

test("enqueue does not mutate the input outbox", () => {
  // Arrange
  const outbox: OutboxEntry[] = [];

  // Act
  enqueue(outbox, entry("k1", "acct-a"));

  // Assert
  assert.equal(outbox.length, 0);
});

test("enqueue dedupes by key: re-enqueuing the same finish is a no-op", () => {
  // Arrange — the same idempotency key, already queued.
  const first = enqueue([], entry("dup", "acct-a"));

  // Act — enqueue the same key again (e.g. a double-tap or a re-fired finish).
  const second = enqueue(first, entry("dup", "acct-a"));

  // Assert — still exactly one entry; the queue never holds two records for one finish.
  assert.equal(second.length, 1);
  assert.equal(second, first, "dedupe returns the same array reference unchanged");
});

test("enqueue keeps multiple distinct finishes so several can queue before any sync", () => {
  // Arrange & Act — three different finishes, each its own key (ADR-0060).
  let outbox = enqueue([], entry("a", "acct-a"));
  outbox = enqueue(outbox, entry("b", "acct-a"));
  outbox = enqueue(outbox, entry("c", "acct-a"));

  // Assert — FIFO order preserved.
  assert.deepEqual(
    outbox.map((e) => e.key),
    ["a", "b", "c"],
  );
});

test("hasEntry reports membership by key", () => {
  const outbox = enqueue([], entry("k1", "acct-a"));
  assert.equal(hasEntry(outbox, "k1"), true);
  assert.equal(hasEntry(outbox, "missing"), false);
});

test("markSyncing flips one entry to syncing and clears its error", () => {
  // Arrange
  const outbox = markFailed(enqueue([], entry("k1", "acct-a")), "k1", "boom");

  // Act
  const next = markSyncing(outbox, "k1");

  // Assert
  assert.equal(next[0].status, "syncing");
  assert.equal(next[0].error, null);
});

test("markSyncing is a no-op for an unknown key", () => {
  const outbox = enqueue([], entry("k1", "acct-a"));
  const next = markSyncing(outbox, "nope");
  assert.equal(next, outbox);
});

test("markSynced removes the delivered entry from the queue", () => {
  // Arrange
  let outbox = enqueue([], entry("a", "acct-a"));
  outbox = enqueue(outbox, entry("b", "acct-a"));

  // Act — a delivered finish is gone from the queue (no lingering "synced" state).
  const next = markSynced(outbox, "a");

  // Assert
  assert.deepEqual(
    next.map((e) => e.key),
    ["b"],
  );
});

test("markSynced is a no-op for an unknown key", () => {
  const outbox = enqueue([], entry("a", "acct-a"));
  assert.equal(markSynced(outbox, "missing"), outbox);
});

test("markFailed records the error and marks the entry retryable", () => {
  // Arrange
  const outbox = markSyncing(enqueue([], entry("k1", "acct-a")), "k1");

  // Act
  const next = markFailed(outbox, "k1", "offline");

  // Assert
  assert.equal(next[0].status, "failed");
  assert.equal(next[0].error, "offline");
});

test("retry resets a failed entry to pending and clears its error", () => {
  // Arrange
  const outbox = markFailed(enqueue([], entry("k1", "acct-a")), "k1", "offline");

  // Act
  const next = retry(outbox, "k1");

  // Assert
  assert.equal(next[0].status, "pending");
  assert.equal(next[0].error, null);
});

test("retryAll resets only the given account's non-pending entries", () => {
  // Arrange — account A has a failed and a syncing entry; account B has a failed one.
  let outbox = enqueue([], entry("a1", "acct-a"));
  outbox = enqueue(outbox, entry("a2", "acct-a"));
  outbox = enqueue(outbox, entry("b1", "acct-b"));
  outbox = markFailed(outbox, "a1", "offline");
  outbox = markSyncing(outbox, "a2");
  outbox = markFailed(outbox, "b1", "offline");

  // Act
  const next = retryAll(outbox, "acct-a");

  // Assert — A's entries are pending again; B's failed entry is untouched.
  assert.equal(next.find((e) => e.key === "a1")?.status, "pending");
  assert.equal(next.find((e) => e.key === "a2")?.status, "pending");
  assert.equal(next.find((e) => e.key === "b1")?.status, "failed");
});

test("entriesForAccount returns only the owner's entries (reject-foreign on read)", () => {
  // Arrange — a shared device with two accounts' entries interleaved.
  let outbox = enqueue([], entry("a1", "acct-a"));
  outbox = enqueue(outbox, entry("b1", "acct-b"));
  outbox = enqueue(outbox, entry("a2", "acct-a"));

  // Act
  const mine = entriesForAccount(outbox, "acct-a");

  // Assert — a foreign account's queued finish is never read here.
  assert.deepEqual(
    mine.map((e) => e.key),
    ["a1", "a2"],
  );
});

test("entriesForAccount returns nothing when no account is signed in", () => {
  const outbox = enqueue([], entry("a1", "acct-a"));
  assert.deepEqual(entriesForAccount(outbox, null), []);
});

test("entriesForAccount is the drain work list: it includes failed and stranded-syncing entries", () => {
  // Arrange — the account has a pending, a failed (retryable), and a syncing entry
  // stranded by a crash mid-delivery; plus a foreign one that must never be drained.
  let outbox = enqueue([], entry("a1", "acct-a"));
  outbox = enqueue(outbox, entry("a2", "acct-a"));
  outbox = enqueue(outbox, entry("a3", "acct-a"));
  outbox = enqueue(outbox, entry("b1", "acct-b"));
  outbox = markFailed(outbox, "a2", "offline");
  outbox = markSyncing(outbox, "a3");

  // Act — the drain re-attempts every undelivered entry it owns (idempotent), so a
  // crash-stranded `syncing` entry is reclaimed rather than lost.
  const work = entriesForAccount(outbox, "acct-a");

  // Assert
  assert.deepEqual(
    work.map((e) => e.key).sort(),
    ["a1", "a2", "a3"],
  );
});

test("hasForeignEntries detects entries owned by another account", () => {
  let outbox = enqueue([], entry("a1", "acct-a"));
  outbox = enqueue(outbox, entry("b1", "acct-b"));
  assert.equal(hasForeignEntries(outbox, "acct-a"), true);
  assert.equal(hasForeignEntries(enqueue([], entry("a1", "acct-a")), "acct-a"), false);
});

test("hasForeignEntries treats every entry as foreign when no account is signed in", () => {
  const outbox = enqueue([], entry("a1", "acct-a"));
  assert.equal(hasForeignEntries(outbox, null), true);
  assert.equal(hasForeignEntries([], null), false);
});
