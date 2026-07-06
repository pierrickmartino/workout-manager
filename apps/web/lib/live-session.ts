// The Live Session engine (issue #86 — F2·S1). A pure reducer over an in-flight
// performance of a Session (see "Live Session" in CONTEXT.md): a record being
// built, holding the sets done so far and which set is current. It has NO
// server-only imports, so both the Server route and the Client screen can use it.

import { NO_LOAD, type Load, type LoadKind } from "./load.ts";
import type { WorkoutSession } from "./sessions-types";

export type SetStatus = "pending" | "completed";

export type LiveStatus = "not_started" | "in_progress" | "finished";

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
}

export type LiveEvent =
  | { type: "START" }
  | {
      type: "COMPLETE_SET";
      index: number;
      reps: number;
      loadKind: LoadKind;
      loadValue: string;
      rpe: number | null;
    }
  | { type: "ADVANCE" }
  | { type: "FINISH" };

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
      return { ...state, status: "in_progress" };

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
      return { ...state, sets, currentIndex: firstPendingIndex(sets) };
    }

    case "ADVANCE":
      return {
        ...state,
        currentIndex: Math.min(state.currentIndex + 1, state.sets.length),
      };

    case "FINISH":
      return { ...state, status: "finished" };

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
