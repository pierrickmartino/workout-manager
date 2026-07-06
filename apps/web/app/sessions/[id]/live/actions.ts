"use server";

import { redirect } from "next/navigation";

import { logSession } from "@/lib/logs";
import type { LogSessionInput } from "@/lib/logs-types";

export interface FinishState {
  error: string | null;
}

// Persist a finished Live Session as a Logged Session through the existing log
// endpoint, then route to history. A null/empty payload — a Live Session finished
// with no completed set — writes nothing but still ends the performance, landing
// the user in history. The mapper (lib/live-session-mapper) builds the payload;
// this action only guards the boundary and talks to the backend.
export async function finishLiveSession(
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

  redirect("/history");
}
