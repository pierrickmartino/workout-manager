// The Hand-Authored Session view-model (ADR-0040, issue #287): turn the build-and-log
// screen's raw fields — the authored *plan* (exercises with sets/reps/rest/tempo/typed
// Load) plus the *record* of what was performed (each set's typed Quantity, Load, and
// perceived difficulty) — into the validated `POST /api/sessions` payload, or a
// user-facing error. Pure and browser-safe (no server-only imports), so the request
// rules are unit-tested here rather than re-derived inside the server action or the
// component. The frontend twin of the backend's `author_and_log_session` boundary.
//
// Supersets (ADR-0023, issue #289) ride on the authored *plan*: consecutive exercises can
// be grouped into a Superset with a group-owned round-rest, reusing the shared
// `supersets` structural vocabulary — the same grouping/ungrouping/round-rest/contiguity
// rules the Protocol Builder uses. The record stays sets-only (the agreed fidelity), so
// the grouping travels only on the prescriptions. Create-by-name (ADR-0033, issue #288) is
// resolved upstream in the picker, so the payload still carries only real `exercise_id`s.

import { repetitionsInput } from "./quantity.ts";
import type { LoadKind } from "./load";
import type { LogSetInput } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";
import {
  flattenSupersets,
  groupWithNext,
  reorderKeepingContiguous,
  supersetLayout,
  ungroup,
  editRoundRest as editSupersetRoundRest,
  type SupersetMember,
  type SupersetSlot,
} from "./supersets.ts";

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

const DEFAULT_LOAD_KIND: LoadKind = "absolute";

const MIN_PERCEIVED_DIFFICULTY = 1;
const MAX_PERCEIVED_DIFFICULTY = 10;

// One performed set the user recorded for an exercise: the reps done, the load, and an
// optional perceived difficulty (the 1–10 scale the log forms label "RPE"). The amount
// is raw — a set with no reps is one the user did not perform and is skipped.
// Distance/duration Quantities are an ad-hoc-log concern; a structured workout records
// repetitions, sent with its typed kind so the backend types the amount at the write
// boundary (ADR-0032).
export interface PerformedSetFields {
  reps?: string;
  loadKind?: string;
  loadValue?: string;
  perceivedDifficulty?: string;
}

// One exercise in the authored workout: the picked catalog Exercise, its plan
// (sets/reps/rest/tempo/typed Load), the Superset overlay, and the sets actually
// performed. `supersetGroup` is `null` for a flat, solo exercise; members of one Superset
// share the tag and carry the group-owned `roundRestSeconds` (ADR-0023). These two fields
// carry the structural state the shared `supersets` operations read and write.
export interface AuthoredExerciseFields {
  exerciseId: number;
  sets: string;
  reps: string;
  restSeconds?: string;
  tempo?: string;
  loadKind?: string;
  loadValue?: string;
  supersetGroup: string | null;
  roundRestSeconds: number | null;
  performedSets: PerformedSetFields[];
}

export interface AuthorSessionFields {
  performedOn: string;
  trainingType: string;
  exercises: AuthoredExerciseFields[];
}

// One authored Exercise Prescription in the payload — the plan side. Mirrors the
// Builder's deploy prescription shape: sets/reps/rest/tempo/typed Load plus the Superset
// overlay (`superset_group`/`round_rest_seconds`, both null on a solo Prescription). The
// server validates the grouping through the Builder's `validate_deploy` rules.
export interface AuthorPrescriptionInput {
  exercise_id: number;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  tempo: string | null;
  load_kind: LoadKind;
  load_value: string | null;
  superset_group: string | null;
  round_rest_seconds: number | null;
}

// The request the user submits to author-and-log a Hand-Authored Session in one POST.
// `performed_on` defaults to today on the client and is capped at today; the plan's
// prescriptions and the first performance's `logged_sets` are written atomically.
export interface AuthorSessionInput {
  performed_on: string;
  training_type: string;
  prescriptions: AuthorPrescriptionInput[];
  logged_sets: LogSetInput[];
}

export type AuthorSessionResult =
  | { ok: true; request: AuthorSessionInput }
  | { ok: false; error: string };

// Today's local date as `YYYY-MM-DD`, the same shape a date input emits, so the two
// compare lexically. Injected as a default so the mapper stays pure and testable.
function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The load fields shared by plan and record: the picked kind (defaulting to absolute) and
// its value, or null when none was entered.
function loadFields(
  loadKind: string | undefined,
  loadValue: string | undefined,
): { load_kind: LoadKind; load_value: string | null } {
  const value = (loadValue ?? "").trim();
  return {
    load_kind: ((loadKind || DEFAULT_LOAD_KIND) as LoadKind),
    load_value: value === "" ? null : value,
  };
}

// A whole, non-negative integer parsed from raw text, or null when blank or malformed.
// Exported so the build-and-log screen parses its numeric inputs (e.g. a Superset's
// round-rest) by the same rule the payload mapper uses, rather than re-deriving it.
export function wholeNonNegative(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

// Build one performed logged-set payload from a row, or null when it was left
// un-performed (no reps) or malformed. The reps ride through as a typed repetitions
// Quantity; the load kind+value and an in-range perceived difficulty ride alongside.
function toLoggedSet(
  exerciseId: number,
  set: PerformedSetFields,
): LogSetInput | null {
  const reps = wholeNonNegative(set.reps ?? "");
  if (reps === null) return null;

  const raw = (set.perceivedDifficulty ?? "").trim();
  const perceived = raw === "" ? null : Number(raw);
  const inRange =
    perceived === null ||
    (Number.isInteger(perceived) &&
      perceived >= MIN_PERCEIVED_DIFFICULTY &&
      perceived <= MAX_PERCEIVED_DIFFICULTY);

  return {
    exercise_id: exerciseId,
    ...repetitionsInput(reps),
    ...loadFields(set.loadKind, set.loadValue),
    perceived_difficulty: inRange ? perceived : null,
  };
}

// Build the authored prescription for one exercise, or an error string naming what is
// wrong with its plan (invalid sets count or a blank rep target).
function toPrescription(
  exercise: AuthoredExerciseFields,
): { ok: true; prescription: AuthorPrescriptionInput } | { ok: false; error: string } {
  const sets = wholeNonNegative(exercise.sets);
  if (sets === null || sets < 1) {
    return { ok: false, error: "Each exercise needs at least one set." };
  }

  const reps = exercise.reps.trim();
  if (reps === "") {
    return { ok: false, error: "Each exercise needs a rep target." };
  }

  const tempo = (exercise.tempo ?? "").trim();
  const restSeconds = wholeNonNegative(exercise.restSeconds ?? "");

  return {
    ok: true,
    prescription: {
      exercise_id: exercise.exerciseId,
      sets,
      reps,
      rest_seconds: restSeconds,
      tempo: tempo === "" ? null : tempo,
      ...loadFields(exercise.loadKind, exercise.loadValue),
      // The Superset overlay rides straight through: grouping is edited on the draft via
      // the shared `supersets` operations, which keep it contiguous and consistent.
      superset_group: exercise.supersetGroup,
      round_rest_seconds: exercise.roundRestSeconds,
    },
  };
}

// Assemble the author-and-log request from the screen's fields, validating at the
// boundary: a date (not in the future), a known training type, at least one exercise
// with a valid plan, and at least one performed set. Returns the payload on success or a
// single user-facing error on the first problem — nothing is sent to the server on a
// rejection.
export function buildAuthorSessionRequest(
  fields: AuthorSessionFields,
  today: string = localToday(),
): AuthorSessionResult {
  const performedOn = fields.performedOn.trim();
  if (performedOn === "") {
    return { ok: false, error: "Pick the date you performed this." };
  }
  if (performedOn > today) {
    return { ok: false, error: "The performed-on date can't be in the future." };
  }

  const trainingType = fields.trainingType.trim();
  if (!VALID_TRAINING_TYPES.has(trainingType)) {
    return { ok: false, error: "Pick a training type." };
  }

  if (fields.exercises.length === 0) {
    return { ok: false, error: "Add at least one exercise." };
  }

  const prescriptions: AuthorPrescriptionInput[] = [];
  const loggedSets: LogSetInput[] = [];
  for (const exercise of fields.exercises) {
    if (!Number.isInteger(exercise.exerciseId)) {
      return { ok: false, error: "Pick every exercise from the catalog." };
    }

    const built = toPrescription(exercise);
    if (!built.ok) return built;
    prescriptions.push(built.prescription);

    for (const set of exercise.performedSets) {
      const loggedSet = toLoggedSet(exercise.exerciseId, set);
      if (loggedSet !== null) loggedSets.push(loggedSet);
    }
  }

  if (loggedSets.length === 0) {
    return { ok: false, error: "Record the reps for at least one set you performed." };
  }

  return {
    ok: true,
    request: {
      performed_on: performedOn,
      training_type: trainingType,
      prescriptions,
      logged_sets: loggedSets,
    },
  };
}

// --- Superset editing on the authored draft (ADR-0023, issue #289). Thin wrappers over
// the shared `supersets` structural operations, so the build-and-log screen groups,
// ungroups, reorders, and sets round-rest by the same rules as the Protocol Builder. Each
// returns a new list; the input is never mutated.

// Group the exercise at `position` with the next one into a Superset, seeding a new
// group's round-rest from the next member's own rest (ADR-0023). The generic operation
// touches only the two overlay fields, preserving every other field and the array's
// per-row identity the screen keys on.
export function groupExerciseWithNext<T extends SupersetMember & { restSeconds?: string }>(
  exercises: T[],
  position: number,
): T[] {
  const seed = wholeNonNegative(exercises[position + 1]?.restSeconds ?? "");
  return groupWithNext(exercises, position, seed);
}

// Dissolve the Superset the exercise at `position` belongs to (a no-op on a solo row).
export function ungroupExercise<T extends SupersetMember>(
  exercises: T[],
  position: number,
): T[] {
  return ungroup(exercises, position);
}

// Set the group-owned round-rest of the Superset at `position` on every member.
export function setExerciseRoundRest<T extends SupersetMember>(
  exercises: T[],
  position: number,
  roundRestSeconds: number | null,
): T[] {
  return editSupersetRoundRest(exercises, position, roundRestSeconds);
}

// Move the exercise at `from` to `to`, refusing any move that would split a Superset so a
// reorder never leaves a group non-contiguous (ADR-0023).
export function reorderExercise<T extends SupersetMember>(
  exercises: T[],
  from: number,
  to: number,
): T[] {
  return reorderKeepingContiguous(exercises, from, to);
}

// The per-exercise Superset layout the screen renders (badges, group brackets, round-rest
// placement, the "group with next" gate). Re-exported so the screen has one import surface
// for authoring supersets.
//
// When `suppressed`, the screen belongs to a Sensitive-Constraint user who is never handed
// a Superset (ADR-0023, issue #290): every "group with next" gate is closed so no grouping
// affordance is offered. Paired with `suppressAuthoredSupersets`, which keeps the draft
// itself flat, this leaves the screen with nothing to group and no way to start one.
export function authoredSupersetLayout(
  exercises: readonly SupersetMember[],
  suppressed = false,
): SupersetSlot[] {
  const layout = supersetLayout(exercises);
  if (!suppressed) return layout;
  return layout.map((slot) => ({ ...slot, canGroupWithNext: false }));
}

// Strip every Superset from the authored draft — the staged, not-committed unlink a
// Sensitive-Constraint user's build-and-log screen applies (ADR-0023, issue #290), the
// twin of the Builder's `initBuilderDraft` auto-unlink. Supersets compress rest and raise
// intensity, exactly the load those users must not be handed, so grouping is paused: the
// screen offers no group control (`authoredSupersetLayout(_, true)`) and any grouping that
// slipped into the draft is flattened here. The `POST /api/sessions` endpoint stays the
// backstop. Returns a new list only when something changed; the input is never mutated.
export function suppressAuthoredSupersets<T extends SupersetMember>(
  exercises: T[],
): T[] {
  return flattenSupersets(exercises);
}

export type { SupersetSlot };
