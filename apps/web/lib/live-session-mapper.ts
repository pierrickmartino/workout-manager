// The finish→payload mapper (issue #86 — F2·S1). Turns a Live Session into the
// request the existing log endpoint accepts, writing one Logged Set per set the
// user actually completed. Pure and server-free — the route calls it, then hands
// the payload to the server action. No schema change: the Logged Session record
// already carries N Logged Sets per Exercise via its flat, ordered list.

import type { LiveSessionState } from "./live-session.ts";
import type { LogSessionInput, LogSetInput } from "./logs-types";

// Map a finished Live Session to the log request. Returns null when no set was
// completed, so an abandoned Live Session writes nothing (Completion Outcome and
// the rest of the record semantics are later slices). Only completed sets become
// Logged Sets; their order follows the flat, position-ordered set list.
export function mapFinishToLog(
  state: LiveSessionState,
  performedOn: string,
): LogSessionInput | null {
  const loggedSets: LogSetInput[] = state.sets
    .filter((set) => set.status === "completed")
    .map((set) => ({
      exercise_id: set.exerciseId,
      reps: set.reps,
      load_kind: set.loadKind,
      // An empty value means "no load recorded" — the backend maps it to null.
      load_value: set.loadValue === "" ? null : set.loadValue,
      perceived_difficulty: set.rpe,
    }));

  if (loggedSets.length === 0) return null;

  return { performed_on: performedOn, logged_sets: loggedSets };
}
