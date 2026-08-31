// The finish→payload mapper (issue #86 — F2·S1). Turns a Live Session into the
// request the existing log endpoint accepts, writing one Logged Set per set the
// user actually completed. Pure and server-free — the route calls it, then hands
// the payload to the server action. No schema change: the Logged Session record
// already carries N Logged Sets per Exercise via its flat, ordered list.

import { completionOutcome, type LiveSessionState } from "./live-session.ts";
import { durationSeconds } from "./live-timer.ts";
import { loadValueToKg } from "./load.ts";
import { repetitionsInput } from "./quantity.ts";
import type { WeightUnit } from "./weight-unit";
import type { LogSessionInput, LogSetInput } from "./logs-types";

// Map a finished Live Session to the log request. Returns null when no set was
// completed, so an abandoned Live Session writes nothing. Only completed sets
// become Logged Sets; their order follows the flat, position-ordered set list. The
// payload carries the derived Completion Outcome (ADR-0013) the engine computes
// from whether every prescribed set was attempted, and the recorded Session Duration
// (ADR-0014) — start → last activity, excluding the idle tail, or null when untracked.
export function mapFinishToLog(
  state: LiveSessionState,
  performedOn: string,
  unit: WeightUnit,
): LogSessionInput | null {
  const loggedSets: LogSetInput[] = state.sets
    .filter((set) => set.status === "completed")
    .map((set) => {
      // The load was entered in the reader's Weight Unit; convert it back to canonical,
      // exact kilograms for storage (#417). A blank value is "no load recorded" → null.
      const loadValueKg = loadValueToKg(set.loadKind, set.loadValue, unit);
      return {
        exercise_id: set.exerciseId,
        // The live set's reps become a repetitions Quantity via the shared mapper.
        ...repetitionsInput(set.reps),
        load_kind: set.loadKind,
        load_value: loadValueKg === "" ? null : loadValueKg,
        perceived_difficulty: set.rpe,
      };
    });

  if (loggedSets.length === 0) return null;

  return {
    performed_on: performedOn,
    completion_outcome: completionOutcome(state),
    duration_seconds: durationSeconds(state.startedAt, state.lastActivityAt),
    logged_sets: loggedSets,
  };
}
