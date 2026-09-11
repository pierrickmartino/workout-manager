"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

import { deliverQueuedFinish } from "@/app/actions/outbox";
import { drainOutbox } from "@/lib/finish-outbox-sync";

// Drives the finish outbox from app scope (issue #413 — ADR-0060). Mounted once under
// the signed-in shell, it renders nothing: it exists only to drain queued finishes to
// the server whenever a delivery window opens — on mount / restart, when connectivity
// returns (`online`), and when the app is brought to the foreground (`visibilitychange`).
// Living in the layout rather than the Live Session screen is deliberate: a finish is
// durable in IndexedDB and no longer tied to any live performance, so it must keep
// syncing after the user has navigated away or reopened the app on another screen.
// Background Sync is a progressive enhancement only; these always-available triggers,
// plus the manual retry the sync-state UI adds (issue #414), are the actual guarantee.
export function OutboxSyncRegistrar(): null {
  const { userId, isLoaded } = useAuth();

  useEffect(() => {
    // Wait for Clerk: draining is account-scoped (ADR-0059), and a null user drains
    // nothing. Re-runs when the signed-in user resolves or changes.
    if (!isLoaded || !userId) return;

    let cancelled = false;
    let inFlight = false;
    // Serialize triggers that fire close together (mount + online) into one pass at a
    // time; a duplicate delivery would be a harmless idempotent no-op, but this keeps
    // the common path from issuing redundant writes.
    const drain = () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      void drainOutbox(userId, deliverQueuedFinish).finally(() => {
        inFlight = false;
      });
    };

    // Drain immediately on mount / app restart, then whenever a delivery window opens.
    drain();
    const onForeground = () => {
      if (document.visibilityState === "visible") drain();
    };
    window.addEventListener("online", drain);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      cancelled = true;
      window.removeEventListener("online", drain);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [isLoaded, userId]);

  return null;
}
