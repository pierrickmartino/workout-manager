// The finish→payload mapper (issue #86 — F2·S1). Turns a Live Session into the
// request the existing log endpoint accepts, writing one Logged Set per set the
// user actually completed. Pure and server-free — the route calls it, then hands
// the payload to the server action. No schema change: the Logged Session record
// already carries N Logged Sets per Exercise via its flat, ordered list.

import { completionOutcome, type LiveSessionState, type LiveSet } from "./live-session.ts";
import { durationSeconds } from "./live-timer.ts";
import { buildLoggedSets, type LoggedSetRow } from "./logged-set.ts";
import { setEntryValues } from "./set-entry.ts";
import type { WeightUnit } from "./weight-unit";
import type { LogSessionInput } from "./logs-types";

// A completed live set as a Logged Set row (ADR-0115). A live set is a rep count against its
// prescription (ADR-0114), so its kind is repetitions; the Load was entered in the reader's
// Weight Unit and the shared builder converts it to canonical kilograms (#417).
function liveSetRow(set: LiveSet): LoggedSetRow {
  return {
    exerciseId: set.exerciseId,
    values: setEntryValues({
      kind: "repetitions",
      reps: String(set.reps),
      load_kind: set.loadKind,
      load_value: set.loadValue,
      rpe: set.rpe === null ? "" : String(set.rpe),
    }),
  };
}

// Map a finished Live Session to the log request. Returns null when no set was
// completed, so an abandoned Live Session writes nothing. Only completed sets
// become Logged Sets; their order follows the flat, position-ordered set list. The
// payload carries the derived Completion Outcome (ADR-0013) the engine computes
// from whether every prescribed set was attempted, and the recorded Session Duration
// (ADR-0014) — start → last activity, excluding the idle tail, or null when untracked.
// The state's client-minted idempotency key (ADR-0060) rides along, so a retried finish
// resends the same key and the server dedupes it to one Logged Session (issue #410).
export function mapFinishToLog(
  state: LiveSessionState,
  performedOn: string,
  unit: WeightUnit,
): LogSessionInput | null {
  // A completed set is the performed mark, so a blank rep count would log as 0. The row's reps
  // are a whole, non-negative number by construction (the set table clamps them), so the build
  // cannot reject one; if it ever does, the invariant broke and failing loudly beats saving a
  // record with sets silently missing.
  const built = buildLoggedSets(
    state.sets.filter((set) => set.status === "completed").map(liveSetRow),
    unit,
    { performedMark: true },
  );
  if (!built.ok) throw new Error(`Live Session finish could not be logged: ${built.error}`);
  const loggedSets = built.sets;

  if (loggedSets.length === 0) return null;

  return {
    performed_on: performedOn,
    completion_outcome: completionOutcome(state),
    duration_seconds: durationSeconds(state.startedAt, state.lastActivityAt),
    idempotency_key: state.idempotencyKey,
    logged_sets: loggedSets,
  };
}
