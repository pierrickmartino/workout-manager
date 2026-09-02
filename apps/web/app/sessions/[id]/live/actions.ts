"use server";

import { logSession } from "@/lib/logs";
import type { LogSessionInput } from "@/lib/logs-types";

export interface FinishState {
  error: string | null;
}

// Persist a finished Live Session as a Logged Session through the existing log
// endpoint. A null/empty payload — a performance with no completed set — writes
// nothing but still succeeds, so an abandoned session ends cleanly. The mapper
// (lib/live-session-mapper) builds the payload; this only guards the boundary and
// talks to the backend. Shared by both the redirecting finish and the summary
// paths (idle auto-end, ending a blocked session), which record without navigating.
async function record(
  sessionId: number,
  input: LogSessionInput | null,
): Promise<FinishState> {
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to finish." };
  }

  if (input && input.logged_sets.length > 0) {
    const result = await logSession(sessionId, input);
    if (!result.success || !result.data) {
      return { error: result.error ?? "Could not save your session." };
    }
  }

  return { error: null };
}

// Finish a Live Session — the normal "Finish session" path. Records the performance
// and returns the outcome *without* navigating: the screen clears the on-device live
// slot only on this acknowledged success and then routes to history itself (ADR-0060,
// issue #412). Redirecting here would throw before the client could distinguish a
// committed write from a dropped one, so the slot must be released client-side.
export async function finishLiveSession(
  sessionId: number,
  input: LogSessionInput | null,
): Promise<FinishState> {
  return record(sessionId, input);
}

// Record a Live Session without navigating — used when the screen shows its own
// summary (idle auto-end, ADR-0014) or continues in place after ending a blocked
// session, rather than redirecting to history.
export async function recordLiveSession(
  sessionId: number,
  input: LogSessionInput | null,
): Promise<FinishState> {
  return record(sessionId, input);
}
