import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveSyncState,
  summarizeOutbox,
  hasQueuedWork,
  EMPTY_OUTBOX_SUMMARY,
  type OutboxSummary,
} from "./sync-state.ts";
import type { OutboxEntry, OutboxStatus } from "./finish-outbox.ts";
import type { LogSessionInput } from "./logs-types.ts";

// A minimal well-formed finish entry; only its status matters to the summary.
function entry(key: string, status: OutboxStatus): OutboxEntry {
  const payload: LogSessionInput = {
    performed_on: "2026-09-02",
    completion_outcome: "completed",
    duration_seconds: 600,
    idempotency_key: key,
    logged_sets: [],
  };
  return {
    key,
    accountId: "acct-a",
    sessionId: 7,
    payload,
    status,
    error: status === "failed" ? "boom" : null,
  };
}

function summary(overrides: Partial<OutboxSummary> = {}): OutboxSummary {
  return { ...EMPTY_OUTBOX_SUMMARY, ...overrides };
}

test("summarizeOutbox tallies entries by lifecycle status", () => {
  // Arrange
  const entries: OutboxEntry[] = [
    entry("a", "pending"),
    entry("b", "pending"),
    entry("c", "syncing"),
    entry("d", "failed"),
  ];

  // Act
  const tally = summarizeOutbox(entries);

  // Assert
  assert.deepEqual(tally, { pending: 2, syncing: 1, failed: 1 });
});

test("summarizeOutbox of an empty queue is the empty summary", () => {
  assert.deepEqual(summarizeOutbox([]), EMPTY_OUTBOX_SUMMARY);
});

test("hasQueuedWork is true when any entry is queued in any status", () => {
  assert.equal(hasQueuedWork(summary({ pending: 1 })), true);
  assert.equal(hasQueuedWork(summary({ syncing: 1 })), true);
  assert.equal(hasQueuedWork(summary({ failed: 1 })), true);
  assert.equal(hasQueuedWork(EMPTY_OUTBOX_SUMMARY), false);
});

test("deriveSyncState: offline wins outright, whatever the queue holds", () => {
  // Even a stranded `failed` entry reads as offline (the real reason is no connection),
  // never a scary generic failure.
  assert.equal(deriveSyncState(false, EMPTY_OUTBOX_SUMMARY), "offline");
  assert.equal(deriveSyncState(false, summary({ pending: 2 })), "offline");
  assert.equal(deriveSyncState(false, summary({ failed: 1 })), "offline");
  assert.equal(deriveSyncState(false, summary({ syncing: 1 })), "offline");
});

test("deriveSyncState: online with an in-flight attempt is syncing", () => {
  assert.equal(deriveSyncState(true, summary({ syncing: 1 })), "syncing");
  // Syncing outranks a queued or failed sibling — a drain is actively working the queue.
  assert.equal(
    deriveSyncState(true, summary({ syncing: 1, pending: 1, failed: 1 })),
    "syncing",
  );
});

test("deriveSyncState: online with a genuine failure and no in-flight attempt is failed", () => {
  assert.equal(deriveSyncState(true, summary({ failed: 1 })), "failed");
  // Failed outranks a merely-pending sibling: the failure needs a manual retry surfaced.
  assert.equal(
    deriveSyncState(true, summary({ failed: 1, pending: 2 })),
    "failed",
  );
});

test("deriveSyncState: online with only queued (undelivered) finishes is saved-locally", () => {
  // The honest "saved on this device — sync pending" state, never a false synced.
  assert.equal(deriveSyncState(true, summary({ pending: 1 })), "saved-locally");
});

test("deriveSyncState: online with an empty queue is synced", () => {
  assert.equal(deriveSyncState(true, EMPTY_OUTBOX_SUMMARY), "synced");
});
