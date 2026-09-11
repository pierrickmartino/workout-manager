// The finish outbox orchestration (issue #413 — ADR-0060): the effectful glue between
// the pure reducer (lib/finish-outbox) and the IndexedDB shell (lib/finish-outbox-store).
// Every state transition — enqueue/dedupe, mark-syncing, synced, failed, reject-foreign —
// is computed by the pure reducer; this file only persists the reducer's results and
// drives delivery. The delivery call itself is injected (`DeliverFinish`) so the transport
// (the `deliverQueuedFinish` server action) stays a thin, swappable boundary. This module
// is an untested effect shell, like the store and the event listeners around it.

import {
  enqueue,
  entriesForAccount,
  hasEntry,
  hasForeignEntries,
  markFailed,
  markSynced,
  markSyncing,
  type OutboxEntry,
} from "./finish-outbox.ts";
import {
  loadOutbox,
  saveOutboxEntry,
  removeOutboxEntry,
} from "./finish-outbox-store.ts";
import { notifyOutboxChange } from "./outbox-observer.ts";
import { recordLastSynced } from "./last-synced-store.ts";
import { FINISH_UNREACHABLE_MESSAGE } from "./live-session-finish.ts";
import type { LogSessionInput } from "./logs-types.ts";

// A delivery failure whose cause the server did name (a returned envelope error), when
// the transport gives no message of its own.
const SYNC_FAILED_MESSAGE = "Could not sync your session.";

// Delivers one queued finish. Resolves ok/error for a server-acknowledged write or a
// returned rejection; REJECTS (throws) when the server was unreachable, which the drain
// translates into a retryable failure. Satisfied by the `deliverQueuedFinish` action.
export type DeliverFinish = (
  sessionId: number,
  payload: LogSessionInput,
) => Promise<{ ok: boolean; error: string | null }>;

// Queue a finished Live Session durably. Runs the pure `enqueue` (which dedupes by key,
// so a re-fired finish never double-queues) and persists the new entry, then reads back
// to confirm it actually landed — IndexedDB can silently no-op in a locked-down browser,
// and the caller must not release the live slot on a save that did not happen. Returns
// whether the finish is durably queued (a same-key duplicate already stored counts).
export async function enqueueFinish(entry: OutboxEntry): Promise<boolean> {
  const stored = await loadOutbox();
  const next = enqueue(stored, entry);
  if (next === stored) return true; // dedupe: this finish is already queued (durable)
  await saveOutboxEntry(next[next.length - 1]); // the appended, normalized entry
  const durable = hasEntry(await loadOutbox(), entry.key);
  // Let the sync-state UI (issue #414) reflect the newly-queued finish immediately —
  // "saved on this device — sync pending" — before any delivery is attempted.
  if (durable) notifyOutboxChange();
  return durable;
}

// Drop every entry not owned by `accountId` from the store (ADR-0059) — defense in depth
// behind the sign-out purge, run before every drain so a shared device never delivers or
// surfaces a foreign account's queued finish even if a prior purge was interrupted.
export async function purgeForeignFinishes(
  accountId: string | null,
): Promise<void> {
  const stored = await loadOutbox();
  if (!hasForeignEntries(stored, accountId)) return;
  const foreign = stored.filter((e) => e.accountId !== accountId);
  for (const entry of foreign) {
    await removeOutboxEntry(entry.key);
  }
  notifyOutboxChange();
}

// Deliver the signed-in account's queued finishes. Purges foreign entries, then attempts
// each of the account's undelivered entries: the pure reducer stamps `syncing` → then
// `synced` (removed) on an acknowledged write, or `failed` on a rejection, and each
// transition is persisted immediately so a crash mid-drain leaves a consistent, resumable
// queue. Concurrent drains are safe — a duplicate delivery is an idempotent no-op
// server-side (ADR-0060). A signed-out reader (`accountId` null) drains nothing.
export async function drainOutbox(
  accountId: string | null,
  deliver: DeliverFinish,
): Promise<void> {
  if (accountId === null) return;
  await purgeForeignFinishes(accountId);

  let outbox = await loadOutbox();
  for (const entry of entriesForAccount(outbox, accountId)) {
    outbox = markSyncing(outbox, entry.key);
    await saveOutboxEntry(requireEntry(outbox, entry.key));
    // Surface "syncing" to the sync-state UI (issue #414) the moment the attempt begins.
    notifyOutboxChange();
    try {
      const result = await deliver(entry.sessionId, entry.payload);
      if (result.ok) {
        outbox = markSynced(outbox, entry.key);
        await removeOutboxEntry(entry.key);
        // A real server acknowledgement — the ONLY place "Last synced …" is stamped
        // (issue #414), so the UI never claims a synced state for an undelivered finish.
        recordLastSynced(accountId, Date.now());
      } else {
        outbox = markFailed(outbox, entry.key, result.error ?? SYNC_FAILED_MESSAGE);
        await saveOutboxEntry(requireEntry(outbox, entry.key));
      }
    } catch {
      // The server was unreachable (offline / dropped connection) — keep the entry,
      // retryable, for the next online / foreground / manual drain.
      outbox = markFailed(outbox, entry.key, FINISH_UNREACHABLE_MESSAGE);
      await saveOutboxEntry(requireEntry(outbox, entry.key));
    }
    // Reflect the resolved outcome — synced (removed), failed, or a reclaimed entry.
    notifyOutboxChange();
  }
}

// The entry for `key`, which a preceding `markSyncing`/`markFailed` guarantees is
// present — the reducer only transitions entries it holds, so a miss is a programmer
// error, not a runtime condition to swallow.
function requireEntry(
  outbox: readonly OutboxEntry[],
  key: string,
): OutboxEntry {
  const found = outbox.find((e) => e.key === key);
  if (!found) throw new Error(`outbox entry ${key} vanished mid-drain`);
  return found;
}
