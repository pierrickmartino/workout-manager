// The finish outbox reducer (issue #413 — ADR-0060). A finished Live Session is an
// immediately-real Logged Session whose *delivery* is in flight: it is queued here,
// durably (the IndexedDB shell in lib/finish-outbox-store persists this list), and
// delivered idempotently on reconnect. This module is the pure heart — enqueue,
// mark-syncing, synced, failed, retry, dedupe, and account scoping — so every rule is
// unit-testable without IndexedDB, `navigator.onLine`, or Clerk. The store and the
// event listeners are thin, untested effect shells around it.
//
// Every function returns a NEW array and never mutates its input (coding-style:
// immutability), so a caller can persist the result without aliasing the prior queue.

import type { LogSessionInput } from "./logs-types.ts";

// Where one queued finish sits in its delivery lifecycle. There is no "synced" status:
// a delivered finish is REMOVED from the queue (the outbox holds only undelivered
// records), so the projection truth stays server-side (ADR-0061). `failed` is
// retryable — a reconnect or manual retry re-attempts it.
export type OutboxStatus = "pending" | "syncing" | "failed";

// One finished Live Session awaiting delivery. The `key` is the client-minted
// idempotency key (ADR-0060, issue #412): it is both this entry's identity in the
// queue (so a re-enqueue dedupes) and the server-side dedupe identity (so a retry
// upsert-returns the first Logged Session instead of creating a second). It equals
// `payload.idempotency_key`.
export interface OutboxEntry {
  key: string;
  // The owner's Clerk account id (ADR-0059). Entries are read and delivered only for
  // their owner and purged on sign-out; a foreign entry is never delivered.
  accountId: string;
  // The Session this finish records against — `POST /api/sessions/{sessionId}/logs`.
  sessionId: number;
  // The finish payload the log endpoint accepts (carries `idempotency_key === key`).
  payload: LogSessionInput;
  status: OutboxStatus;
  // The last delivery error, surfaced by the sync-state UI (issue #414); null unless
  // a delivery attempt failed.
  error: string | null;
}

// Build a fresh, pending outbox entry for a just-finished Live Session. The idempotency
// key doubles as the queue key and the server dedupe identity (ADR-0060, issue #412); a
// payload with no key cannot be delivered idempotently, so this returns null and the
// caller keeps the record where it is rather than queuing an undeliverable finish.
export function buildOutboxEntry(
  accountId: string,
  sessionId: number,
  payload: LogSessionInput,
): OutboxEntry | null {
  const key = payload.idempotency_key;
  if (!key) return null;
  return { key, accountId, sessionId, payload, status: "pending", error: null };
}

// True when a finish with this key is already queued — the dedupe predicate.
export function hasEntry(
  outbox: readonly OutboxEntry[],
  key: string,
): boolean {
  return outbox.some((e) => e.key === key);
}

// Queue a finished Live Session for delivery. Dedupes by key: a finish already queued
// (a double-tap, a re-fired handler) is a no-op — the record is already durable, so the
// same array is returned unchanged. A genuinely new finish is appended (FIFO) and
// normalized to a clean `pending` state, so it never inherits a stray failed/syncing
// status or error from however the caller built it.
export function enqueue(
  outbox: readonly OutboxEntry[],
  entry: OutboxEntry,
): OutboxEntry[] {
  if (hasEntry(outbox, entry.key)) return outbox as OutboxEntry[];
  return [...outbox, { ...entry, status: "pending", error: null }];
}

// Mark a delivery attempt as in flight. Clears any prior error so a retry doesn't show
// stale failure text while it runs. A no-op (same reference) for an unknown key.
export function markSyncing(
  outbox: readonly OutboxEntry[],
  key: string,
): OutboxEntry[] {
  return mapEntry(outbox, key, (e) => ({ ...e, status: "syncing", error: null }));
}

// Remove a delivered finish from the queue. A 2xx (first delivery or an idempotent
// no-op on retry) means "this exact finish is recorded", so it leaves the outbox
// entirely. A no-op for an unknown key.
export function markSynced(
  outbox: readonly OutboxEntry[],
  key: string,
): OutboxEntry[] {
  if (!hasEntry(outbox, key)) return outbox as OutboxEntry[];
  return outbox.filter((e) => e.key !== key);
}

// Record a failed delivery attempt and leave the entry retryable. The error rides on
// the entry for the sync-state UI (issue #414). A no-op for an unknown key.
export function markFailed(
  outbox: readonly OutboxEntry[],
  key: string,
  error: string,
): OutboxEntry[] {
  return mapEntry(outbox, key, (e) => ({ ...e, status: "failed", error }));
}

// Reset one entry to pending so the next drain re-attempts it (a manual retry, or
// clearing a failed state before a re-drain). A no-op for an unknown key.
export function retry(
  outbox: readonly OutboxEntry[],
  key: string,
): OutboxEntry[] {
  return mapEntry(outbox, key, toPending);
}

// Reset every one of the given account's non-pending entries to pending — the "retry
// all" a reconnect or a manual retry runs before draining, so failed and stalled
// in-flight entries are re-attempted together. Other accounts' entries are untouched.
export function retryAll(
  outbox: readonly OutboxEntry[],
  accountId: string | null,
): OutboxEntry[] {
  if (accountId === null) return outbox as OutboxEntry[];
  return outbox.map((e) =>
    e.accountId === accountId && e.status !== "pending" ? toPending(e) : e,
  );
}

// The owner's entries only (reject-foreign on read, ADR-0059): a foreign account's
// queued finish is never read here, and persisting this result back is the active
// purge. Nothing belongs to a signed-out reader, so a null account reads empty. This is
// also the drain's work list — every undelivered entry, whatever its status: a `failed`
// one is retried, and a `syncing` one is reclaimed (a crash can strand an entry mid-
// delivery). Re-delivering an entry another drain is already handling is a harmless
// idempotent no-op server-side (ADR-0060), and delivery order does not matter — every
// projection keys on each record's own `performed_on`, not sync-arrival order.
export function entriesForAccount(
  outbox: readonly OutboxEntry[],
  accountId: string | null,
): OutboxEntry[] {
  if (accountId === null) return [];
  return outbox.filter((e) => e.accountId === accountId);
}

// Whether the queue holds any entry NOT owned by the given account — the signal the
// store uses to decide it must write a purged copy back on hydration. With no account
// signed in, any entry is foreign.
export function hasForeignEntries(
  outbox: readonly OutboxEntry[],
  accountId: string | null,
): boolean {
  return outbox.some((e) => e.accountId !== accountId);
}

// Replace the single entry matching `key` via `f`, returning the same reference when
// no entry matches so callers can cheaply detect a no-op.
function mapEntry(
  outbox: readonly OutboxEntry[],
  key: string,
  f: (entry: OutboxEntry) => OutboxEntry,
): OutboxEntry[] {
  if (!hasEntry(outbox, key)) return outbox as OutboxEntry[];
  return outbox.map((e) => (e.key === key ? f(e) : e));
}

function toPending(entry: OutboxEntry): OutboxEntry {
  return { ...entry, status: "pending", error: null };
}
