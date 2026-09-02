// The Live Session engine (issue #86 — F2·S1). A pure reducer over an in-flight
// performance of a Session (see "Live Session" in CONTEXT.md): a record being
// built, holding the sets done so far and which set is current. It has NO
// server-only imports, so both the Server route and the Client screen can use it.

import { formatLoad, loadToFields, type Load, type LoadKind } from "./load.ts";
import type { WeightUnit } from "./weight-unit";
import type {
  ExercisePrescription,
  PreviousSet,
  WorkoutSession,
} from "./sessions-types";

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
  // 0-based ordinal of the *unit* this set belongs to, for the header's `x/y`. A
  // solo Prescription is one unit; a whole Superset is one unit (ADR-0023), so all
  // its interleaved members share this index.
  unitIndex: number;
  setNumber: number; // 1-based set within its module — the round number when grouped
  moduleSetCount: number; // total prescribed sets in this module — the round count
  // Superset overlay (ADR-0023). `supersetGroup` is the persisted group tag (null on
  // a solo Prescription); `supersetLabel` is its display letter (A, B…) for the round
  // badge. Both null when the set is not part of a Superset.
  supersetGroup: string | null;
  supersetLabel: string | null;
  // Whether a rest countdown starts after this set. False between members within a
  // round (a Superset rests only at the round boundary — ADR-0023), true for the
  // last member of each round and for every solo set.
  restsAfter: boolean;
  // The plan rest to run after this set when `restsAfter` is true: the Superset's
  // round-rest at a round boundary, or a solo Prescription's own rest. Null lets the
  // caller fall back to its default. Irrelevant (null) when `restsAfter` is false.
  restSeconds: number | null;
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
  // The owner's Clerk account id (ADR-0059, amending ADR-0035). Stamped on START so
  // every persisted slot carries who it belongs to; hydration on another account
  // purges it rather than offering a cross-account resume on a shared browser. Null
  // in a not-yet-started performance (no owner until START) — such a state is never
  // persisted, so a stored slot always carries a real id.
  accountId: string | null;
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
  // START stamps the owner (`accountId`, ADR-0059) alongside the timing instant, so
  // the first persisted write of a fresh performance already carries who it belongs
  // to. Omitting it (untimed/ownerless START) leaves the owner unchanged.
  | { type: "START"; now?: number; accountId?: string }
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
// - `purge` — the slot belongs to a *different* account (or no signed-in account can
//   claim it); it is discarded and this Session starts fresh, so a shared browser
//   never offers one account's workout to another (ADR-0059, amending ADR-0035).
export type LiveEntry =
  | { kind: "start_fresh" }
  | { kind: "resume"; state: LiveSessionState }
  | { kind: "auto_end"; state: LiveSessionState }
  | { kind: "blocked"; existing: LiveSessionState }
  | { kind: "purge" };

// Whether the idle gap between `lastActivityAt` and `now` has run past the cap. An
// untimed performance (no last-activity) can't be measured, so it never expires.
function isIdleExpired(lastActivityAt: number | null, now: number): boolean {
  if (lastActivityAt === null) return false;
  return now - lastActivityAt > IDLE_TIMEOUT_MS;
}

// Whether a persisted slot belongs to the currently signed-in account (ADR-0059).
// True only when there is a stored slot, a signed-in user, and the two ids match —
// so a foreign slot, a legacy id-less slot, and an unauthenticated read all read as
// "not mine". The ownership boundary the resume path and the Home banner both gate on.
export function ownsLiveSlot(
  stored: LiveSessionState | null,
  currentAccountId: string | null,
): boolean {
  return (
    stored !== null &&
    currentAccountId !== null &&
    stored.accountId === currentAccountId
  );
}

// Decide what happens when the user arrives at a Session's live route, given the
// single persisted slot (`stored`, or null when empty), the `requestedSessionId`,
// the current wall-clock `now`, and the signed-in `currentAccountId` (null when no
// user is loaded). This is the engine's ownership, resume-vs-auto-end, and
// single-session-enforcement verdict; the screen renders it. Pure — no I/O.
export function resolveLiveEntry(
  stored: LiveSessionState | null,
  requestedSessionId: number,
  now: number,
  currentAccountId: string | null,
): LiveEntry {
  // An empty slot has nothing to resume — begin this Session fresh.
  if (stored === null) {
    return { kind: "start_fresh" };
  }
  // A slot owned by a *different* account (or unclaimable — no signed-in user, a
  // legacy id-less slot) is never offered here: it is purged and this Session starts
  // fresh, so a shared browser never leaks one account's workout to another (ADR-0059).
  // Ownership precedes every other verdict — a foreign slot for a different Session
  // is purged, not treated as a block on the current account.
  if (!ownsLiveSlot(stored, currentAccountId)) {
    return { kind: "purge" };
  }
  // An owned slot holding an already-finished performance has nothing to resume.
  if (stored.status === "finished") {
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
// the plan prescribed (ADR-0010), expressed in the reader's Weight Unit so the input
// shows what they would type. Delegates to the shared `loadToFields` reverse-map, so
// the live pre-fill, the Log Correction pre-fill, and the Capture seed all project the
// plan's kilograms into the reader's unit the same way (#417). On finish the entered
// value is converted back to exact kilograms by the finish mapper.
function prefillLoad(
  load: Load | null,
  unit: WeightUnit,
): { kind: LoadKind; value: string } {
  const { loadKind, loadValue } = loadToFields(load, unit);
  return { kind: loadKind, value: loadValue };
}

// The previous-performance reference for the 1-based ``setNumber`` of a
// prescription, aligned to its logged sets by ordinal. Null when the Exercise has
// no logged set at this ordinal — a shorter history, or no history at all.
function previousReference(
  previousPerformance: PreviousSet[] | undefined,
  setNumber: number,
  unit: WeightUnit,
): PreviousReference | null {
  const previous = previousPerformance?.[setNumber - 1];
  if (!previous) return null;
  return { reps: previous.reps, loadText: formatLoad(previous.load, unit) };
}

// One countable step of a Session: a solo Exercise Prescription, or a contiguous
// run of Prescriptions sharing a Superset tag (ADR-0023). Units are what the header
// counts and what expansion order is decided per.
interface SessionUnit {
  group: string | null; // the shared Superset tag, or null for a solo Prescription
  members: ExercisePrescription[];
}

// Partition a Session's Prescriptions into units: each solo Prescription is its own
// unit, and a maximal contiguous run of Prescriptions with the same non-null
// `superset_group` collapses into one Superset unit. Contiguity is the persisted
// invariant (ADR-0023) the DEPLOY gate / generation degrade already enforce.
function partitionUnits(
  prescriptions: readonly ExercisePrescription[],
): SessionUnit[] {
  const units: SessionUnit[] = [];
  for (const prescription of prescriptions) {
    const group = prescription.superset_group ?? null;
    const last = units[units.length - 1];
    if (group !== null && last !== undefined && last.group === group) {
      last.members.push(prescription);
    } else {
      units.push({ group, members: [prescription] });
    }
  }
  return units;
}

// Build one expanded set row from an Exercise Prescription, carrying its unit index
// and Superset overlay. `setNumber` is the set's ordinal within its member (the
// round number when grouped); previous-performance still aligns by that ordinal, so
// interleaving never disturbs it (ADR-0023).
function buildLiveSet(
  prescription: ExercisePrescription,
  unitIndex: number,
  setNumber: number,
  supersetGroup: string | null,
  supersetLabel: string | null,
  restsAfter: boolean,
  restSeconds: number | null,
  unit: WeightUnit,
): LiveSet {
  const load = prefillLoad(prescription.recommended_load, unit);
  return {
    exerciseId: prescription.exercise_id,
    exerciseName: prescription.exercise_name,
    modulePosition: prescription.position,
    unitIndex,
    setNumber,
    moduleSetCount: prescription.sets,
    supersetGroup,
    supersetLabel,
    restsAfter,
    restSeconds,
    prescribedReps: prescription.reps,
    // The prescribed Load is projected into the reader's unit from its numeric fields
    // (like every other Load, #417), not echoed from the stored kg `text`.
    prescribedLoadText: formatLoad(prescription.recommended_load ?? null, unit),
    previous: previousReference(prescription.previous_performance, setNumber, unit),
    reps: prefillReps(prescription.reps),
    loadKind: load.kind,
    loadValue: load.value,
    rpe: null,
    status: "pending",
  };
}

// Expand a Session's Exercise Prescriptions into a flat, ordered list of individual
// set rows, each pre-filled from the raw Session read. Solo Prescriptions expand
// module-major (all their sets in a row); a Superset expands round-major — one set
// of each member per round (`A1, B1, A2, B2…`), resting only at the round boundary
// (ADR-0023). The result is a not-yet-started Live Session ready for START.
export function initLiveSession(
  session: WorkoutSession,
  weightUnit: WeightUnit,
): LiveSessionState {
  const sets: LiveSet[] = [];
  let supersetOrdinal = 0;

  partitionUnits(session.prescriptions).forEach((unit, unitIndex) => {
    // A valid Superset is two or more members (ADR-0023); a lone tagged Prescription
    // is treated as solo, so a degenerate group never shows a round badge or borrows
    // the round-major path.
    const isSuperset = unit.group !== null && unit.members.length >= 2;

    if (!isSuperset) {
      const [prescription] = unit.members;
      for (let setNumber = 1; setNumber <= prescription.sets; setNumber += 1) {
        sets.push(
          buildLiveSet(
            prescription,
            unitIndex,
            setNumber,
            null,
            null,
            true,
            prescription.rest_seconds ?? null,
            weightUnit,
          ),
        );
      }
      return;
    }

    const label = String.fromCharCode(65 + supersetOrdinal);
    supersetOrdinal += 1;
    // Members share a set count (equal counts are enforced — ADR-0023); `rounds`
    // takes the max so a ragged group that slipped through still expands safely.
    const rounds = Math.max(...unit.members.map((member) => member.sets));
    const lastMemberIndex = unit.members.length - 1;

    for (let round = 1; round <= rounds; round += 1) {
      unit.members.forEach((member, memberIndex) => {
        if (round > member.sets) return; // ragged tail — this member has no set here
        const isRoundBoundary = memberIndex === lastMemberIndex;
        sets.push(
          buildLiveSet(
            member,
            unitIndex,
            round,
            unit.group,
            label,
            isRoundBoundary,
            isRoundBoundary ? (member.round_rest_seconds ?? null) : null,
            weightUnit,
          ),
        );
      });
    }
  });

  return {
    sessionId: session.id,
    // Owner is unknown until START stamps the signed-in account (ADR-0059); a
    // not-yet-started performance is never persisted, so this null never reaches a slot.
    accountId: null,
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
      // untimed one leaves them null (timing is opt-in). It also stamps the owner
      // (ADR-0059), so the first persisted write carries the account it belongs to;
      // an ownerless START leaves the owner unchanged.
      return {
        ...state,
        status: "in_progress",
        accountId: event.accountId ?? state.accountId,
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

// The current unit as a 1-based `x` of `y` total units, for the header. A Superset
// counts as one unit alongside solo Prescriptions (ADR-0023), so its interleaved
// members never inflate the count. `x` tracks the current-set pointer, never past `y`.
export function currentUnit(state: LiveSessionState): {
  index: number;
  total: number;
} {
  const total = new Set(state.sets.map((set) => set.unitIndex)).size;
  const set = currentSet(state);
  return { index: set ? set.unitIndex + 1 : 0, total };
}

// The Superset context of the current set for the round badge (`SUPERSET A · ROUND
// 2/3`): its display label and the current round of the total. Null when the current
// set is a solo Prescription, so the header falls back to the plain unit indicator.
export function currentSuperset(state: LiveSessionState): {
  label: string;
  round: number;
  totalRounds: number;
} | null {
  const set = currentSet(state);
  if (!set || set.supersetLabel === null) return null;
  return {
    label: set.supersetLabel,
    round: set.setNumber,
    totalRounds: set.moduleSetCount,
  };
}

// The "up next" cue for the rest card: the on-deck set the current-set pointer sits
// on — what the user will perform when the running rest ends.
export interface RestCue {
  exerciseName: string;
  // The on-deck set's 1-based ordinal within its module — the round number when the
  // set belongs to a Superset.
  setNumber: number;
  // Total prescribed sets in that module — the round count when grouped.
  setCount: number;
  // The Superset display letter (A, B…) when the on-deck set is grouped, else null.
  supersetLabel: string | null;
}

// The rest-card cue: describe the on-deck set — the one the pointer already advanced
// to on the completion that started this rest. At a Superset round boundary the
// pointer sits on the first member of the *next* round, so this honestly names that
// member (e.g. "Bench Press · round 2/3"), never the exercise *after* it that
// `nextExercise` (a forward look-ahead) would surface. Null only for a Session with
// no prescribed sets.
export function restCue(state: LiveSessionState): RestCue | null {
  const set = currentSet(state);
  if (!set) return null;
  return {
    exerciseName: set.exerciseName,
    setNumber: set.setNumber,
    setCount: set.moduleSetCount,
    supersetLabel: set.supersetLabel,
  };
}

// The exercise the current-set pointer sits on — the on-deck movement the sticky
// "Next up" line names and its jump control scrolls to. Null once the pointer has
// run off the end (every set attempted), so the bar drops "Next up" and prompts
// Finish instead of naming an already-done set.
export function onDeckExercise(state: LiveSessionState): string | null {
  if (state.currentIndex >= state.sets.length) return null;
  return state.sets[state.currentIndex].exerciseName;
}

// A stable, unique DOM id for one set row, so the sticky "Next up" control can
// scroll straight to the current on-deck set. `modulePosition`+`setNumber` is unique
// across a Session — solo sets differ by setNumber, Superset members by position.
export function liveSetDomId(set: LiveSet): string {
  return `live-set-${set.modulePosition}-${set.setNumber}`;
}

// One rendered set carrying its absolute index into `state.sets`. The screen groups
// sets for display but still dispatches COMPLETE_SET/ADVANCE by that absolute index.
export interface LiveUnitSet {
  set: LiveSet;
  index: number;
}

// A unit as the live screen renders it: a solo Prescription's sets, or a whole
// Superset (ADR-0023). A fully-completed unit collapses to its one-line `summary`;
// the current and upcoming units stay expanded (`containsCurrent` keeps the pointer's
// unit open even at the moment it is being finished).
export interface LiveUnit {
  unitIndex: number;
  // The Superset display letter (A, B…) when this unit is a Superset, else null.
  supersetLabel: string | null;
  // The distinct Exercise names in this unit, in first-appearance order: one for a
  // solo unit, the members for a Superset.
  exerciseNames: string[];
  sets: LiveUnitSet[];
  // Every set in the unit has been attempted (completed) — the collapse trigger. A
  // skipped set stays `pending`, so a unit with any left-behind set is never complete.
  isComplete: boolean;
  // The current-set pointer sits on a set in this unit — keeps it expanded.
  containsCurrent: boolean;
  // The collapsed one-liner: "Back Squat — 3 sets" or
  // "Superset A · Bench Press + Barbell Row — 3 rounds".
  summary: string;
}

// English pluralization for a whole-number count and a singular noun.
function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// The distinct Exercise names in a unit's sets, in first-appearance order.
function unitExerciseNames(sets: readonly LiveUnitSet[]): string[] {
  const names: string[] = [];
  for (const { set } of sets) {
    if (!names.includes(set.exerciseName)) names.push(set.exerciseName);
  }
  return names;
}

// The collapsed summary for a completed unit. A solo unit reads as its name and its
// set count; a Superset reads as its label, members, and round count (rounds =
// prescribed sets per member, carried on each set as `moduleSetCount`).
function unitSummary(
  supersetLabel: string | null,
  exerciseNames: readonly string[],
  sets: readonly LiveUnitSet[],
): string {
  if (supersetLabel === null) {
    return `${exerciseNames[0]} — ${pluralize(sets.length, "set")}`;
  }
  const rounds = Math.max(...sets.map(({ set }) => set.moduleSetCount));
  return `Superset ${supersetLabel} · ${exerciseNames.join(" + ")} — ${pluralize(rounds, "round")}`;
}

// Group the flat set list back into units for display (ADR-0023): a maximal run of
// sets sharing a `unitIndex` is one unit. Each unit carries its sets (with absolute
// indices), whether it is fully completed (the collapse trigger), whether it holds
// the current-set pointer, and its collapsed one-line summary. Pure — no I/O.
export function groupUnits(state: LiveSessionState): LiveUnit[] {
  const units: LiveUnit[] = [];
  const byUnit = new Map<number, LiveUnitSet[]>();
  const order: number[] = [];

  state.sets.forEach((set, index) => {
    const existing = byUnit.get(set.unitIndex);
    if (existing) {
      existing.push({ set, index });
    } else {
      byUnit.set(set.unitIndex, [{ set, index }]);
      order.push(set.unitIndex);
    }
  });

  for (const unitIndex of order) {
    const sets = byUnit.get(unitIndex)!;
    const supersetLabel = sets[0].set.supersetLabel;
    const exerciseNames = unitExerciseNames(sets);
    units.push({
      unitIndex,
      supersetLabel,
      exerciseNames,
      sets,
      isComplete: sets.every(({ set }) => set.status === "completed"),
      containsCurrent: sets.some(({ index }) => index === state.currentIndex),
      summary: unitSummary(supersetLabel, exerciseNames, sets),
    });
  }

  return units;
}

// A preview of the next exercise to come — the first upcoming set (in performed
// order) whose Exercise differs from the current one. Inside a Superset this
// naturally surfaces the co-member (the very next set is another Exercise); for a
// solo module it previews the next module. Null when nothing different remains.
export function nextExercise(state: LiveSessionState): string | null {
  if (state.sets.length === 0) return null;
  const index = Math.min(state.currentIndex, state.sets.length - 1);
  const currentName = state.sets[index].exerciseName;
  for (let ahead = index + 1; ahead < state.sets.length; ahead += 1) {
    if (state.sets[ahead].exerciseName !== currentName) {
      return state.sets[ahead].exerciseName;
    }
  }
  return null;
}
