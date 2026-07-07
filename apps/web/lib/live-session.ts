// The Live Session engine (issue #86 — F2·S1). A pure reducer over an in-flight
// performance of a Session (see "Live Session" in CONTEXT.md): a record being
// built, holding the sets done so far and which set is current. It has NO
// server-only imports, so both the Server route and the Client screen can use it.

import { formatLoad, NO_LOAD, type Load, type LoadKind } from "./load.ts";
import type { PreviousSet, WorkoutSession } from "./sessions-types";

export type SetStatus = "pending" | "completed";

// The previous-performance reference shown alongside a set — the reps and
// display-ready load the user did on this Exercise last time (issue #90 — F2·S5).
export interface PreviousReference {
  reps: number;
  loadText: string;
}

export type LiveStatus = "not_started" | "in_progress" | "finished";

// The Completion Outcome (ADR-0013): whether the performance attempted every
// prescribed set. Completed when all sets were attempted (a zero-rep completed set
// still counts as attempted); Incomplete when any set was left un-attempted.
export type CompletionOutcome = "completed" | "incomplete";

// One prescribed set, expanded from an Exercise Prescription into its own row.
// `reps`/`loadKind`/`loadValue`/`rpe` are the user-editable record; the
// `prescribed*` fields keep the original plan for the eye.
export interface LiveSet {
  exerciseId: number;
  exerciseName: string;
  modulePosition: number; // the prescription's position — identifies the module
  moduleIndex: number; // 0-based ordinal of the module, for `x/y` display
  setNumber: number; // 1-based set within its module
  moduleSetCount: number; // total prescribed sets in this module
  prescribedReps: string;
  prescribedLoadText: string;
  // The previous performance to beat for this set, aligned by ordinal, or null
  // when the Exercise has no logged set at this ordinal (or none at all).
  previous: PreviousReference | null;
  reps: number;
  loadKind: LoadKind;
  loadValue: string;
  rpe: number | null;
  status: SetStatus;
}

export interface LiveSessionState {
  sessionId: number;
  sets: LiveSet[];
  currentIndex: number;
  status: LiveStatus;
  // Wall-clock timestamps (epoch ms) backing Session Duration (ADR-0014).
  // `startedAt` is stamped on START; `lastActivityAt` moves to each set completion,
  // so start → last activity excludes the idle tail after the final set. Both are
  // null until a timed START (timing is opt-in — see `now` on the events).
  startedAt: number | null;
  lastActivityAt: number | null;
}

export type LiveEvent =
  | { type: "START"; now?: number }
  | {
      type: "COMPLETE_SET";
      index: number;
      reps: number;
      loadKind: LoadKind;
      loadValue: string;
      rpe: number | null;
      now?: number;
    }
  | { type: "ADVANCE" }
  | { type: "FINISH"; now?: number }
  // Restore a persisted Live Session wholesale (issue #91 — F2·S6). Used on the
  // next foreground to resume the single `localStorage` slot exactly where the user
  // left off, rather than re-initializing and re-STARTing the performance.
  | { type: "HYDRATE"; state: LiveSessionState };

// The idle cap (ADR-0014): a gap of inactivity longer than this auto-ends the Live
// Session as Incomplete on the next foreground, so a recorded Session Duration
// never counts time the user was away. Thirty minutes.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// What returning to the live route does, decided from the single persisted slot
// (issue #91 — F2·S6):
// - `start_fresh` — no unfinished performance persisted; begin this Session.
// - `resume` — the persisted performance is this Session, within the idle window;
//   restore it (set table, current set, elapsed timer) and carry on.
// - `auto_end` — the persisted performance is this Session but idle past the cap;
//   finalize it as Incomplete (ADR-0014) and show a summary instead of resuming.
// - `blocked` — a *different* unfinished performance exists; starting this one is
//   blocked with a resume-or-end prompt so real work is never discarded (ADR-0012).
export type LiveEntry =
  | { kind: "start_fresh" }
  | { kind: "resume"; state: LiveSessionState }
  | { kind: "auto_end"; state: LiveSessionState }
  | { kind: "blocked"; existing: LiveSessionState };

// Whether the idle gap between `lastActivityAt` and `now` has run past the cap. An
// untimed performance (no last-activity) can't be measured, so it never expires.
function isIdleExpired(lastActivityAt: number | null, now: number): boolean {
  if (lastActivityAt === null) return false;
  return now - lastActivityAt > IDLE_TIMEOUT_MS;
}

// Decide what happens when the user arrives at a Session's live route, given the
// single persisted slot (`stored`, or null when empty), the `requestedSessionId`,
// and the current wall-clock `now`. This is the engine's resume-vs-auto-end and
// single-session-enforcement verdict; the screen renders it. Pure — no I/O.
export function resolveLiveEntry(
  stored: LiveSessionState | null,
  requestedSessionId: number,
  now: number,
): LiveEntry {
  // An empty slot, or a slot holding an already-finished performance, has nothing
  // to resume — begin this Session fresh.
  if (stored === null || stored.status === "finished") {
    return { kind: "start_fresh" };
  }
  // An unfinished performance of a *different* Session blocks starting this one:
  // there is only one slot, and real work is never silently superseded (ADR-0012).
  if (stored.sessionId !== requestedSessionId) {
    return { kind: "blocked", existing: stored };
  }
  // The unfinished performance is this Session: resume it, unless the idle gap has
  // run past the cap, in which case it auto-ends as Incomplete on this foreground.
  if (isIdleExpired(stored.lastActivityAt, now)) {
    return { kind: "auto_end", state: stored };
  }
  return { kind: "resume", state: stored };
}

// Parse the leading whole-number rep count from a free-text prescription (e.g.
// "8-12" → 8, "10" → 10). Non-numeric prescriptions (e.g. "AMRAP") pre-fill 0,
// leaving the user to enter what they actually did.
function prefillReps(reps: string): number {
  const parsed = Number.parseInt(reps, 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

// Derive the editable kind+value pair a set row starts from, off the typed Load
// the plan prescribed (ADR-0010). Only the field the kind carries is surfaced;
// an absent load pre-fills an empty absolute value.
function prefillLoad(load: Load | null): { kind: LoadKind; value: string } {
  if (!load) return { kind: "absolute", value: "" };
  switch (load.kind) {
    case "absolute":
      return { kind: load.kind, value: load.kg !== undefined ? String(load.kg) : "" };
    case "percent_1rm":
      return { kind: load.kind, value: load.percent !== undefined ? String(load.percent) : "" };
    case "bodyweight":
      return { kind: load.kind, value: load.added_kg !== undefined ? String(load.added_kg) : "" };
    case "range":
      return {
        kind: load.kind,
        value:
          load.low_kg !== undefined && load.high_kg !== undefined
            ? `${load.low_kg}-${load.high_kg}`
            : "",
      };
    case "qualitative":
      return { kind: load.kind, value: load.text };
  }
}

// The previous-performance reference for the 1-based ``setNumber`` of a
// prescription, aligned to its logged sets by ordinal. Null when the Exercise has
// no logged set at this ordinal — a shorter history, or no history at all.
function previousReference(
  previousPerformance: PreviousSet[] | undefined,
  setNumber: number,
): PreviousReference | null {
  const previous = previousPerformance?.[setNumber - 1];
  if (!previous) return null;
  return { reps: previous.reps, loadText: formatLoad(previous.load) };
}

// Expand a Session's Exercise Prescriptions into a flat, position-ordered list of
// individual set rows, each pre-filled from the raw Session read. The result is a
// not-yet-started Live Session ready for START.
export function initLiveSession(session: WorkoutSession): LiveSessionState {
  const sets: LiveSet[] = [];
  session.prescriptions.forEach((prescription, moduleIndex) => {
    const load = prefillLoad(prescription.recommended_load);
    for (let setNumber = 1; setNumber <= prescription.sets; setNumber += 1) {
      sets.push({
        exerciseId: prescription.exercise_id,
        exerciseName: prescription.exercise_name,
        modulePosition: prescription.position,
        moduleIndex,
        setNumber,
        moduleSetCount: prescription.sets,
        prescribedReps: prescription.reps,
        prescribedLoadText: prescription.recommended_load?.text ?? NO_LOAD,
        previous: previousReference(
          prescription.previous_performance,
          setNumber,
        ),
        reps: prefillReps(prescription.reps),
        loadKind: load.kind,
        loadValue: load.value,
        rpe: null,
        status: "pending",
      });
    }
  });

  return {
    sessionId: session.id,
    sets,
    currentIndex: 0,
    status: "not_started",
    startedAt: null,
    lastActivityAt: null,
  };
}

// The pure state transition. Every branch returns a new state; the input is never
// mutated.
export function liveSessionReducer(
  state: LiveSessionState,
  event: LiveEvent,
): LiveSessionState {
  switch (event.type) {
    case "START":
      if (state.status !== "not_started") return state;
      // A timed START seeds both the start and the first last-activity instant; an
      // untimed one leaves them null (timing is opt-in).
      return {
        ...state,
        status: "in_progress",
        startedAt: event.now ?? null,
        lastActivityAt: event.now ?? null,
      };

    case "COMPLETE_SET": {
      const sets = state.sets.map((set, index) =>
        index === event.index
          ? {
              ...set,
              reps: event.reps,
              loadKind: event.loadKind,
              loadValue: event.loadValue,
              rpe: event.rpe,
              status: "completed" as const,
            }
          : set,
      );
      // Completing a set is the activity that moves last-activity; a completion
      // without a `now` leaves it untouched.
      return {
        ...state,
        sets,
        currentIndex: firstPendingIndex(sets),
        lastActivityAt: event.now ?? state.lastActivityAt,
      };
    }

    case "ADVANCE":
      return {
        ...state,
        currentIndex: Math.min(state.currentIndex + 1, state.sets.length),
      };

    case "FINISH":
      return { ...state, status: "finished" };

    case "HYDRATE":
      // Adopt the persisted snapshot wholesale — it is already a complete,
      // immutable state (restored from the slot), so it replaces the current one.
      return event.state;

    default:
      return state;
  }
}

// The index of the earliest still-pending set, or the list length when every set
// is done — the honest "current set" after a completion, regardless of the order
// sets were completed in.
function firstPendingIndex(sets: readonly LiveSet[]): number {
  const index = sets.findIndex((set) => set.status === "pending");
  return index === -1 ? sets.length : index;
}

// The set the current-set pointer sits on, clamped to the last row once the
// pointer has run off the end (every set attempted). Undefined only for an empty
// Session with no prescribed sets.
function currentSet(state: LiveSessionState): LiveSet | undefined {
  if (state.sets.length === 0) return undefined;
  const index = Math.min(state.currentIndex, state.sets.length - 1);
  return state.sets[index];
}

// Set-based percent-complete: attempted (completed) sets over total prescribed
// sets, rounded to a whole percent. Zero for an empty Session.
export function progressPercent(state: LiveSessionState): number {
  const total = state.sets.length;
  if (total === 0) return 0;
  const attempted = state.sets.filter((set) => set.status === "completed").length;
  return Math.round((attempted / total) * 100);
}

// The derived Completion Outcome (ADR-0013): Completed only when every prescribed
// set was attempted (a set is "attempted" once it is completed — even at zero reps,
// ground out to failure); Incomplete when any prescribed set is still pending
// (skipped/left un-attempted). This is the client-declared verdict the finish
// mapper sends; it reaches 100% progress exactly when the outcome is Completed.
export function completionOutcome(state: LiveSessionState): CompletionOutcome {
  const anyUnattempted = state.sets.some((set) => set.status !== "completed");
  return anyUnattempted ? "incomplete" : "completed";
}

// The current module as a 1-based `x` of `y` total modules, for the header. `x`
// tracks the current-set pointer and never exceeds `y`.
export function currentModule(state: LiveSessionState): {
  index: number;
  total: number;
} {
  const total = new Set(state.sets.map((set) => set.modulePosition)).size;
  const set = currentSet(state);
  return { index: set ? set.moduleIndex + 1 : 0, total };
}

// A preview of the exercise the next module introduces — the first set whose
// module comes after the current one. Null when the current module is the last.
export function nextExercise(state: LiveSessionState): string | null {
  const set = currentSet(state);
  if (!set) return null;
  const upcoming = state.sets.find(
    (candidate) => candidate.moduleIndex > set.moduleIndex,
  );
  return upcoming ? upcoming.exerciseName : null;
}
