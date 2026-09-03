// The pure sync-state decision (issue #414 — the honest connectivity/sync surface over
// the finish outbox from #413). It mirrors the wake-lock split (lib/wake-lock): the whole
// rule that turns "am I online?" plus "what does the outbox hold?" into one of five honest,
// user-facing states lives here as a pure function, so it is unit-testable with no
// `navigator.onLine`, no IndexedDB, and no Clerk. The connectivity read and the outbox read
// are thin effect shells around this (lib/use-connectivity, lib/use-sync-status).
//
// The cardinal honesty rule (CONTEXT / issue #414): these five states are never collapsed
// into one generic "error", and "synced" is claimed ONLY when the server has actually
// acknowledged the write — a queued-but-undelivered finish reads as "saved on this device",
// never a false "synced".

import type { OutboxEntry } from "./finish-outbox.ts";

// The five distinct states the UI surfaces, most-actionable first in the derivation below:
//   - offline        no connection; queued work is safe on-device and will sync on reconnect
//   - saved-locally  online, a finish is durably queued but not yet delivered ("sync pending")
//   - syncing        online, a delivery attempt is in flight
//   - failed         online, a delivery attempt was rejected/unreachable and needs a retry
//   - synced         all clear — nothing queued (the last delivery, if any, was acknowledged)
export type SyncState =
  | "offline"
  | "saved-locally"
  | "syncing"
  | "synced"
  | "failed";

// A count of the account's queued finishes by lifecycle status — the only thing the
// derivation needs from the outbox, so the pure rule never depends on entry shape.
export interface OutboxSummary {
  pending: number;
  syncing: number;
  failed: number;
}

// An empty summary — no queued finishes.
export const EMPTY_OUTBOX_SUMMARY: OutboxSummary = {
  pending: 0,
  syncing: 0,
  failed: 0,
};

// Count the account's queued finishes by status. The caller has already scoped the
// entries to the owner (entriesForAccount, ADR-0059); this only tallies them.
export function summarizeOutbox(
  entries: readonly OutboxEntry[],
): OutboxSummary {
  // Fold into a fresh summary each step (coding-style: immutability — never mutate in
  // place), starting from the empty tally.
  return entries.reduce<OutboxSummary>(
    (tally, entry) => ({ ...tally, [entry.status]: tally[entry.status] + 1 }),
    EMPTY_OUTBOX_SUMMARY,
  );
}

// True when any finish is still queued (in any lifecycle status) — i.e. there is
// undelivered work on the device.
export function hasQueuedWork(summary: OutboxSummary): boolean {
  return summary.pending + summary.syncing + summary.failed > 0;
}

// Decide the single honest state to present, from connectivity and the outbox summary.
// Pure — no DOM, no I/O.
//
// Offline wins outright: while there is no connection, the honest headline is "offline",
// whatever the queue holds (a finish stranded `failed` by a drain that ran while offline
// is really just "can't reach the server", i.e. offline — never a scary "failed"). The
// offline surface still names how many finishes are saved on-device, so "saved locally"
// stays visible without pretending a sync could be happening.
//
// Once online, the queue decides, most-urgent first: an in-flight attempt (`syncing`), then
// a genuine failure that needs a manual retry (`failed`), then a durably-queued finish
// waiting its turn (`saved-locally`). With nothing queued, everything is `synced`.
export function deriveSyncState(
  online: boolean,
  summary: OutboxSummary,
): SyncState {
  if (!online) return "offline";
  if (summary.syncing > 0) return "syncing";
  if (summary.failed > 0) return "failed";
  if (summary.pending > 0) return "saved-locally";
  return "synced";
}
