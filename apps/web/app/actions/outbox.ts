"use server";

import { classifyDelivery, type DeliveryResult } from "@/lib/finish-outbox";
import { deliverSessionLog } from "@/lib/logs";
import type { LogSessionInput } from "@/lib/logs-types";

// Deliver one queued finished Live Session to the log endpoint (ADR-0060). The finish
// is already a real Logged Session on the device; this is only its transport. The write
// is idempotent server-side (issue #410) — it dedupes on `payload.idempotency_key` — so
// re-delivering the same queued entry after a lost response upsert-returns the first
// record instead of creating a second. The Clerk JWT is attached server-side by the
// transport seam and never reaches the browser; the backend enforces ownership of the
// Session being logged, so a foreign or missing Session comes back as a `404`, not a
// wrong write — classified as terminal (`orphaned`, #636) so the drain stops retrying it.
//
// A thrown/rejected call (the browser could not reach this server — offline, a dropped
// connection) propagates to the caller, which treats it as an unreachable, retryable
// failure. Only a returned envelope error is a server-side rejection.
export async function deliverQueuedFinish(
  sessionId: number,
  input: LogSessionInput,
): Promise<DeliveryResult> {
  if (!Number.isInteger(sessionId)) {
    return { outcome: "failed", error: "Could not determine which session to sync." };
  }
  if (input.logged_sets.length === 0) {
    // A finish with no completed set records nothing but is "delivered" — drop it from
    // the queue rather than retrying a write the server has nothing to store.
    return { outcome: "delivered" };
  }

  const { status, envelope } = await deliverSessionLog(sessionId, input);
  return classifyDelivery(status, envelope);
}
