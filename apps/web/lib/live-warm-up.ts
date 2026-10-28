import type { LiveSessionState } from "./live-session.ts";
import type { WorkoutSession } from "./sessions-types.ts";
import { warmUpButtonView, type WarmUpButtonView } from "./warm-up-suggestion.ts";

// The Live Session's Warm-up Suggestion (ADR-0143, #783). The same button, preview and Add as the
// Session preview (`warm-up-suggestion.ts`), with the live rules on top: the button shows only
// until the first non-warm-up set is completed. Pure and server-free, so the screen stays a shell.

function anyWorkingSetCompleted(state: LiveSessionState): boolean {
  return state.sets.some((set) => set.setType !== "warm_up" && set.status === "completed");
}

// The Live Session's warm-up button: the Session preview's label and offline rule, hidden once a
// non-warm-up set is completed (asking for a warm-up mid-workout is out of scope).
export function liveWarmUpButtonView(
  session: WorkoutSession,
  state: LiveSessionState,
  online: boolean,
): WarmUpButtonView {
  const base = warmUpButtonView(session, online);
  return { ...base, visible: base.visible && !anyWorkingSetCompleted(state) };
}

export const LIVE_WARM_UP_ADD_LOCKED_NOTE =
  "A set is already logged, so a warm-up can only be added from the Session before you start.";

export const LIVE_WARM_UP_KEPT_NOTE =
  "Warm-up saved to the Session. It will be there the next time you start it.";

function anySetCompleted(state: LiveSessionState): boolean {
  return state.sets.some((set) => set.status === "completed");
}

// Why the preview's Add is locked, or null while it is allowed. Adding reloads the Live Session
// from the updated Session, which is safe only while no set — warm-up or not — has been
// completed (ADR-0143).
export function liveWarmUpAddLockedNote(state: LiveSessionState): string | null {
  return anySetCompleted(state) ? LIVE_WARM_UP_ADD_LOCKED_NOTE : null;
}

export type LiveWarmUpAfterAdd = { kind: "reload" } | { kind: "keep"; note: string };

// What a saved warm-up does to the running Live Session. With nothing completed it reloads
// through the live load path, never merging drills on the client (ADR-0012). If a set was
// completed while the save was in flight, a reload would discard it, so the performance keeps
// running and the drills wait on the Session for next time.
export function afterLiveWarmUpAdded(state: LiveSessionState): LiveWarmUpAfterAdd {
  return anySetCompleted(state)
    ? { kind: "keep", note: LIVE_WARM_UP_KEPT_NOTE }
    : { kind: "reload" };
}
