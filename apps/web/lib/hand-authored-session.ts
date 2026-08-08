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

import {
  distanceInput,
  durationInput,
  parseDurationSeconds,
  repetitionsInput,
  type DistanceUnit,
  type QuantityKind,
} from "./quantity.ts";
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

// The amount kind defaults to `repetitions` — the amount the form has always collected —
// so an ordinary strength movement is unchanged and needs no extra clicks (ADR-0032).
const DEFAULT_AMOUNT_KIND: QuantityKind = "repetitions";

// A distance exercise's unit is chosen once for the whole exercise (a run is logged in km
// or miles, not a mix), defaulting to km — the same default the ad-hoc log uses (ADR-0032).
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

const MIN_PERCEIVED_DIFFICULTY = 1;
const MAX_PERCEIVED_DIFFICULTY = 10;

// One performed set the user recorded for an exercise: the amount done (a rep count or, on
// a duration exercise, a held time), the load, and an optional perceived difficulty (the
// 1–10 scale the log forms label "RPE"). The amount is raw — a set with no amount is one
// the user did not perform and is skipped. Which field carries the amount follows the
// exercise's Amount kind, not the set: a structured exercise's sets are homogeneous
// (ADR-0032, ADR-0040), so `reps` and `duration` are never both meaningful at once.
export interface PerformedSetFields {
  reps?: string;
  // The distance covered on a `distance` exercise's set, a positive value in the exercise's
  // chosen unit (km/mi), sent as a `distance` Quantity the backend canonicalises to metres.
  distance?: string;
  // On a `duration` exercise, the held time (`mm:ss`, `hh:mm:ss`, or bare seconds), sent
  // verbatim as a `duration` Quantity. On a `distance` exercise, the *optional* companion
  // time from which pace becomes a derivable read — one field, one meaning per kind, as in
  // the ad-hoc log (issue #301). The backend canonicalises either to seconds.
  duration?: string;
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
  // The per-exercise Amount kind (ADR-0032), defaulting to `repetitions`. Chosen once for
  // the whole exercise — a movement's sets are homogeneous — it governs both the plan-side
  // target field and the shape of every performed set beneath it. This deliberately differs
  // from the ad-hoc log, which picks a kind per set (issue #299/#300).
  kind?: QuantityKind;
  // The distance unit (km/mi, default km) a `distance` exercise's sets are all read in —
  // chosen once for the exercise, not per set (issue #301). Ignored by other kinds.
  unit?: DistanceUnit;
  sets: string;
  // The plan-side target, kept free text for every kind (ADR-0032 defers typing the plan
  // side): a rep target ("8-12") for reps, a hold time ("45s") for duration. Only its
  // label, placeholder, and required-target wording follow the kind — never a schema change.
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

// The Amount kind an exercise carries, defaulting to `repetitions` for a blank/absent value.
function amountKind(kind: QuantityKind | undefined): QuantityKind {
  return kind ?? DEFAULT_AMOUNT_KIND;
}

// The Load kind an exercise defaults to for its Amount kind: `absolute` for reps (the
// existing default), `bodyweight` for a hold or a run — a Dead hang, plank, or run is
// usually bodyweight-borne, removing the "Weight (kg)" friction of the reported case
// (ADR-0032, issue #299/#300/#301). Still a default only: an explicit pick (a weighted hang,
// a weighted-vest run) overrides it. Exported so the form applies the same rule on a kind
// switch as the payload mapper applies on build.
export function defaultLoadKindForAmount(kind: QuantityKind): LoadKind {
  return kind === "repetitions" ? "absolute" : "bodyweight";
}

// The load fields shared by plan and record: the picked kind (falling back to the Amount
// kind's default) and its value, or null when none was entered.
function loadFields(
  loadKind: string | undefined,
  loadValue: string | undefined,
  kind: QuantityKind,
): { load_kind: LoadKind; load_value: string | null } {
  const value = (loadValue ?? "").trim();
  return {
    load_kind: ((loadKind || defaultLoadKindForAmount(kind)) as LoadKind),
    load_value: value === "" ? null : value,
  };
}

// A performed set built from a row: a typed amount, or one of two non-set outcomes — the
// row was left blank (skip it silently) or its amount is malformed (reject the whole form
// with a clear message). Reps skip on both blank and malformed (regression: unchanged);
// duration and distance distinguish a blank row (skip) from a garbled amount (reject), so a
// mistake is never silently dropped (issues #300/#301). The `fields` widen to the distance
// shape (unit + optional companion time); other kinds simply omit those keys.
type AmountResult =
  | {
      status: "amount";
      fields: Pick<
        LogSetInput,
        "quantity_kind" | "quantity_value" | "quantity_unit" | "quantity_duration"
      >;
    }
  | { status: "skip" }
  | { status: "error"; error: string };

// A performed set after mapping: the built payload, a silent skip, or a form-level error.
type PerformedSetResult =
  | { status: "set"; set: LogSetInput }
  | { status: "skip" }
  | { status: "error"; error: string };

// The reps amount for a performed set, or a skip when the row is blank or malformed — the
// behavior repetition-based logging has always had (a whole, non-negative count).
function repetitionsPerformedAmount(set: PerformedSetFields): AmountResult {
  const reps = wholeNonNegative(set.reps ?? "");
  if (reps === null) return { status: "skip" };
  return { status: "amount", fields: repetitionsInput(reps) };
}

// The duration amount for a performed set: a blank hold is skipped, a malformed or
// non-positive time is rejected outright, and a valid time rides through verbatim as a
// `duration` Quantity (the backend canonicalises to seconds).
function durationPerformedAmount(set: PerformedSetFields): AmountResult {
  const raw = (set.duration ?? "").trim();
  if (raw === "") return { status: "skip" };

  const seconds = parseDurationSeconds(raw);
  if (seconds === null || seconds <= 0) {
    return {
      status: "error",
      error: "Enter a valid hold time (like 45 or 1:30) for each duration set, or leave it blank.",
    };
  }
  return { status: "amount", fields: durationInput(raw) };
}

// The distance amount for a performed set: a blank distance is skipped, a malformed or
// non-positive value is rejected outright, and a valid distance rides through as a
// `distance` Quantity carrying the exercise's unit (canonicalised to metres by the backend)
// and the optional companion time from which pace becomes a derivable read (issue #301). A
// blank time is sent as null, so pace stays underivable for a distance-only set.
function distancePerformedAmount(
  set: PerformedSetFields,
  unit: DistanceUnit,
): AmountResult {
  const raw = (set.distance ?? "").trim();
  if (raw === "") return { status: "skip" };

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      status: "error",
      error: "Enter a valid distance (like 5 or 3.1) for each distance set, or leave it blank.",
    };
  }
  return { status: "amount", fields: distanceInput(raw, unit, set.duration ?? "") };
}

// Dispatch to the amount mapper for the exercise's Amount kind. Reuses the shared quantity
// request builders (`repetitionsInput` / `distanceInput` / `durationInput`), the same ones
// the ad-hoc log uses, so the two forms type the amount identically (ADR-0032). Distance
// also needs the exercise's chosen unit — the one field that lives on the exercise, not the set.
function performedAmount(
  kind: QuantityKind,
  unit: DistanceUnit,
  set: PerformedSetFields,
): AmountResult {
  switch (kind) {
    case "duration":
      return durationPerformedAmount(set);
    case "distance":
      return distancePerformedAmount(set, unit);
    default:
      return repetitionsPerformedAmount(set);
  }
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

// Build one performed logged-set payload from a row, dispatching on the exercise's Amount
// kind. Returns the built set, a skip (the row was left un-performed), or an error (the
// amount is malformed). The typed amount rides as a Quantity; the load kind+value (with
// the kind's default) and an in-range perceived difficulty ride alongside.
function toLoggedSet(
  exerciseId: number,
  kind: QuantityKind,
  unit: DistanceUnit,
  set: PerformedSetFields,
): PerformedSetResult {
  const amount = performedAmount(kind, unit, set);
  if (amount.status !== "amount") return amount;

  const raw = (set.perceivedDifficulty ?? "").trim();
  const perceived = raw === "" ? null : Number(raw);
  const inRange =
    perceived === null ||
    (Number.isInteger(perceived) &&
      perceived >= MIN_PERCEIVED_DIFFICULTY &&
      perceived <= MAX_PERCEIVED_DIFFICULTY);

  return {
    status: "set",
    set: {
      exercise_id: exerciseId,
      ...amount.fields,
      ...loadFields(set.loadKind, set.loadValue, kind),
      perceived_difficulty: inRange ? perceived : null,
    },
  };
}

// The required-target error for an exercise whose plan is missing a target, worded for the
// Amount kind so a duration/distance exercise never errors about a "rep target" (issues
// #300/#301).
function missingTargetError(kind: QuantityKind): string {
  switch (kind) {
    case "duration":
      return "Each exercise needs a target hold time.";
    case "distance":
      return "Each exercise needs a target distance.";
    default:
      return "Each exercise needs a rep target.";
  }
}

// Build the authored prescription for one exercise, or an error string naming what is
// wrong with its plan (invalid sets count or a blank target). The target stays required
// and free text for every kind (ADR-0032); only its wording follows the Amount kind.
function toPrescription(
  exercise: AuthoredExerciseFields,
  kind: QuantityKind,
): { ok: true; prescription: AuthorPrescriptionInput } | { ok: false; error: string } {
  const sets = wholeNonNegative(exercise.sets);
  if (sets === null || sets < 1) {
    return { ok: false, error: "Each exercise needs at least one set." };
  }

  const reps = exercise.reps.trim();
  if (reps === "") {
    return { ok: false, error: missingTargetError(kind) };
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
      ...loadFields(exercise.loadKind, exercise.loadValue, kind),
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

    const kind = amountKind(exercise.kind);
    const unit = exercise.unit ?? DEFAULT_DISTANCE_UNIT;
    const built = toPrescription(exercise, kind);
    if (!built.ok) return built;
    prescriptions.push(built.prescription);

    for (const set of exercise.performedSets) {
      const outcome = toLoggedSet(exercise.exerciseId, kind, unit, set);
      if (outcome.status === "error") return { ok: false, error: outcome.error };
      if (outcome.status === "set") loggedSets.push(outcome.set);
    }
  }

  if (loggedSets.length === 0) {
    return { ok: false, error: "Record an amount for at least one set you performed." };
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
