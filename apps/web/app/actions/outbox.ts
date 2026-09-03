"use server";

import { logSession } from "@/lib/logs";
import type { LogSessionInput } from "@/lib/logs-types";

// Delivery result for one queued finish, as the client-side drain runner reads it
// (lib/finish-outbox-sync). `ok` removes the entry from the outbox; a non-ok result
// keeps it, retryable, with `error` surfaced by the sync-state UI (issue #414).
export interface DeliverResult {
  ok: boolean;
  error: string | null;
}

// Deliver one queued finished Live Session to the log endpoint (ADR-0060). The finish
// is already a real Logged Session on the device; this is only its transport. The write
// is idempotent server-side (issue #410) — it dedupes on `payload.idempotency_key` — so
// re-delivering the same queued entry after a lost response upsert-returns the first
// record instead of creating a second. The Clerk JWT is attached server-side by the
// transport seam and never reaches the browser; the backend enforces ownership of the
// Session being logged, so a foreign or missing Session comes back as an error, not a
// wrong write.
//
// A thrown/rejected call (the browser could not reach this server — offline, a dropped
// connection) propagates to the caller, which treats it as an unreachable, retryable
// failure. Only a returned envelope error is a server-side rejection.
export async function deliverQueuedFinish(
  sessionId: number,
  input: LogSessionInput,
): Promise<DeliverResult> {
  if (!Number.isInteger(sessionId)) {
    return { ok: false, error: "Could not determine which session to sync." };
  }
  if (input.logged_sets.length === 0) {
    // A finish with no completed set records nothing but is "delivered" — drop it from
    // the queue rather than retrying a write the server has nothing to store.
    return { ok: true, error: null };
  }

  const result = await logSession(sessionId, input);
  if (!result.success || !result.data) {
    return { ok: false, error: result.error ?? "Could not sync your session." };
  }
  return { ok: true, error: null };
}
