"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

import { deliverQueuedFinish } from "@/app/actions/outbox";
import { loadOutbox } from "./finish-outbox-store.ts";
import { entriesForAccount } from "./finish-outbox.ts";
import { drainOutbox } from "./finish-outbox-sync.ts";
import { readLastSynced } from "./last-synced-store.ts";
import { subscribeOutboxChange } from "./outbox-observer.ts";
import { useConnectivity } from "./use-connectivity.ts";
import {
  deriveSyncState,
  summarizeOutbox,
  EMPTY_OUTBOX_SUMMARY,
  type OutboxSummary,
  type SyncState,
} from "./sync-state.ts";

// What the sync-state UI reads. `state` is the pure five-way decision; the rest is the
// supporting detail the presentation needs (the queue counts, when the last finish actually
// landed, and a manual retry).
export interface SyncStatus {
  state: SyncState;
  online: boolean;
  summary: OutboxSummary;
  // Epoch ms of the last server-acknowledged finish for this account, or null when none —
  // shown only for the `synced` state so "Last synced …" never appears without a real ack.
  lastSyncedAt: number | null;
  // Re-drive delivery of the account's queued finishes now (the manual retry the `failed`
  // state offers). A no-op while signed out.
  retry: () => void;
}

// The effect shell behind the honest sync-state surface (issue #414). It mirrors how
// `useWakeLock` wraps `wakeLockAction`: every *decision* is the pure `deriveSyncState`
// seam; this hook only reads the effectful inputs (connectivity, the IndexedDB outbox, the
// last-synced stamp), re-reading the outbox whenever it changes, and hands the pure result
// plus a manual retry to the UI. It is a thin, deliberately uncovered shell.
export function useSyncStatus(): SyncStatus {
  const { userId, isLoaded } = useAuth();
  const accountId = isLoaded ? userId ?? null : null;
  const online = useConnectivity();
  const [summary, setSummary] = useState<OutboxSummary>(EMPTY_OUTBOX_SUMMARY);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Re-read the account's queued finishes and last-synced stamp from storage. Runs on
  // mount, on every outbox change (enqueue / drain transition / purge), and on account
  // change — a signed-out reader reads an empty summary (account-scoped, ADR-0059).
  const refresh = useCallback(async () => {
    if (accountId === null) {
      setSummary(EMPTY_OUTBOX_SUMMARY);
      setLastSyncedAt(null);
      return;
    }
    const stored = await loadOutbox();
    setSummary(summarizeOutbox(entriesForAccount(stored, accountId)));
    setLastSyncedAt(readLastSynced(accountId));
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void refresh();
    };
    run();
    const unsubscribe = subscribeOutboxChange(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  const retry = useCallback(() => {
    if (accountId === null) return;
    // drainOutbox re-attempts every undelivered entry (including `failed` ones) and
    // publishes each transition, so the summary updates live via the subscription above.
    void drainOutbox(accountId, deliverQueuedFinish);
  }, [accountId]);

  return {
    state: deriveSyncState(online, summary),
    online,
    summary,
    lastSyncedAt,
    retry,
  };
}
