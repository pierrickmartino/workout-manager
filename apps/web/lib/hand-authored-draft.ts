import type { CaptureSeedExercise } from "./capture-seed.ts";
import { DEFAULT_EFFORT_SCALE, KNOWN_EFFORT_SCALES, type EffortScale } from "./effort.ts";
import {
  MAX_DRAFT_ROWS,
  hasUniqueKeys,
  isBoundedDraftString,
  isDraftDate,
  isDraftUuid,
  isPositiveInteger,
} from "./form-draft-validation.ts";
import {
  defaultLoadKindForAmount,
  type AuthoredExerciseFields,
  type SupersetSlot,
} from "./hand-authored-session.ts";
import type { PickedExercise } from "./protocol-builder.ts";
import type { DistanceUnit, QuantityKind } from "./quantity.ts";
import { TRAINING_TYPES } from "./sessions-types.ts";

// The in-progress draft behind the two Hand-Authored forms (ADR-0040, audit C-1). Both forms
// author a plan; only the Log form also records a first performance (the plan-vs-record split,
// GLOSSARY). So a plan row and a logged row are two types: `PlanExerciseRow` is what both share,
// and `LoggedExerciseRow` adds the sets performed. Each form persists its own draft shape
// through `useFormDraft`, validated here at the storage boundary.

// One exercise in the draft: the picked catalog Exercise, its authored plan, and its Superset
// overlay. `supersetGroup`/`roundRestSeconds` are the two structural fields the shared
// `supersets` operations read and write.
export interface PlanExerciseRow {
  key: number;
  exerciseId: number;
  exerciseName: string;
  // The per-exercise Amount kind (ADR-0032): Reps (default), Duration, or Distance. It governs
  // the plan-side target field's wording and, on a logged row, every performed-set input.
  kind: QuantityKind;
  // The distance unit every set of a distance exercise reads in (km/mi), chosen once for the
  // exercise (issue #301). Carried for all kinds but only meaningful for distance.
  unit: DistanceUnit;
  sets: string;
  reps: string;
  restSeconds: string;
  tempo: string;
  // The Set Type (ADR-0065, #466): blank or `working` authors a plain working set (stored null).
  setType: string;
  // The Exercise Note (ADR-0065, #451): raw text, blank for no note; the backend length-caps and
  // HTML-escapes it at the write boundary.
  note: string;
  // The Target Effort (ADR-0066, #454): a scale pick plus a value, blank for no target; the
  // backend validates the value against its scale's band at the write boundary.
  targetEffortScale: EffortScale;
  targetEffortValue: string;
  loadKind: string;
  loadValue: string;
  supersetGroup: string | null;
  roundRestSeconds: number | null;
}

// One performed set the user is recording under an exercise, with a stable key so React can
// track rows across add/remove. Both amount fields are held; which one is meaningful (and
// rendered) follows the exercise's Amount kind, since a structured exercise's sets are
// homogeneous (ADR-0032, issue #300).
export interface PerformedSetRow {
  key: number;
  reps: string;
  // On a distance exercise, the distance covered; `duration` then carries the optional
  // companion time. On a duration exercise, `duration` is the held time itself.
  distance: string;
  duration: string;
  loadKind: string;
  loadValue: string;
  perceivedDifficulty: string;
}

// A plan row plus the record half: what was actually performed, set by set.
export interface LoggedExerciseRow extends PlanExerciseRow {
  performedSets: PerformedSetRow[];
}

// What the plan-only form (`/sessions/build`, Capture) keeps in browser storage.
export interface PlanDraft {
  trainingType: string;
  exercises: PlanExerciseRow[];
}

// What the Log form (`/sessions/log`) keeps: the plan, the date it was performed, and the
// idempotency key its single author-and-log submit carries.
export interface LogDraft {
  idempotencyKey: string;
  performedOn: string;
  trainingType: string;
  exercises: LoggedExerciseRow[];
}

export const DEFAULT_TRAINING_TYPE = "strength";
const DEFAULT_AMOUNT_KIND: QuantityKind = "repetitions";
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

// Row keys are unique across the page so React can track rows across add, remove and restore.
let nextKey = 0;
export function makeKey(): number {
  nextKey += 1;
  return nextKey;
}

// After restoring a stored draft, keep fresh keys clear of every key it already uses.
export function reserveKeysThrough(highest: number): void {
  nextKey = Math.max(nextKey, highest);
}

// The highest key a draft's rows use, performed sets included.
export function highestDraftKey(
  rows: readonly (PlanExerciseRow & { performedSets?: readonly { key: number }[] })[],
): number {
  return rows.reduce(
    (highest, row) =>
      Math.max(highest, row.key, ...(row.performedSets ?? []).map((set) => set.key)),
    0,
  );
}

// A performed-set row starts with a blank load kind so the payload mapper derives it from the
// exercise's Amount kind (absolute for reps, bodyweight for a hold): one source of truth for
// the default.
export function makePerformedSet(): PerformedSetRow {
  return {
    key: makeKey(),
    reps: "",
    distance: "",
    duration: "",
    loadKind: "",
    loadValue: "",
    perceivedDifficulty: "",
  };
}

export function makePlanRow(exercise: PickedExercise): PlanExerciseRow {
  return {
    key: makeKey(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    kind: DEFAULT_AMOUNT_KIND,
    unit: DEFAULT_DISTANCE_UNIT,
    sets: "3",
    reps: "",
    restSeconds: "",
    tempo: "",
    setType: "",
    note: "",
    targetEffortScale: DEFAULT_EFFORT_SCALE,
    targetEffortValue: "",
    loadKind: defaultLoadKindForAmount(DEFAULT_AMOUNT_KIND),
    loadValue: "",
    supersetGroup: null,
    roundRestSeconds: null,
  };
}

export function makeLoggedRow(exercise: PickedExercise): LoggedExerciseRow {
  return { ...makePlanRow(exercise), performedSets: [makePerformedSet()] };
}

// A plan row seeded from a Captured record's exercise (ADR-0044): the plan fields the fold could
// recover (Amount kind, unit, sets, target, Load) are filled. Rest, tempo, Set Type, Note, Target
// Effort and Supersets stay blank, because a plan-less record never carried them.
export function seededPlanRow(seed: CaptureSeedExercise): PlanExerciseRow {
  return {
    key: makeKey(),
    exerciseId: seed.exerciseId,
    exerciseName: seed.exerciseName,
    kind: seed.kind,
    unit: seed.unit,
    sets: seed.sets,
    reps: seed.reps,
    restSeconds: "",
    tempo: "",
    setType: "",
    note: "",
    targetEffortScale: DEFAULT_EFFORT_SCALE,
    targetEffortValue: "",
    loadKind: seed.loadKind,
    loadValue: seed.loadValue,
    supersetGroup: null,
    roundRestSeconds: null,
  };
}

// The plan half of a row as the request builders read it. A plan row has no performed sets.
export function toAuthoredFields(
  row: PlanExerciseRow & { performedSets?: readonly PerformedSetRow[] },
): AuthoredExerciseFields {
  return {
    exerciseId: row.exerciseId,
    kind: row.kind,
    unit: row.unit,
    sets: row.sets,
    reps: row.reps,
    restSeconds: row.restSeconds,
    tempo: row.tempo,
    setType: row.setType,
    note: row.note,
    targetEffortScale: row.targetEffortScale,
    targetEffortValue: row.targetEffortValue,
    loadKind: row.loadKind,
    loadValue: row.loadValue,
    supersetGroup: row.supersetGroup,
    roundRestSeconds: row.roundRestSeconds,
    performedSets: (row.performedSets ?? []).map((set) => ({
      reps: set.reps,
      distance: set.distance,
      duration: set.duration,
      loadKind: set.loadKind,
      loadValue: set.loadValue,
      perceivedDifficulty: set.perceivedDifficulty,
    })),
  };
}

// --- Performed-set edits on a logged row. Each returns a new list; the input is never mutated.

export function addPerformedSet(
  rows: readonly LoggedExerciseRow[],
  exerciseKey: number,
): LoggedExerciseRow[] {
  return rows.map((row) =>
    row.key === exerciseKey
      ? { ...row, performedSets: [...row.performedSets, makePerformedSet()] }
      : row,
  );
}

export function updatePerformedSet(
  rows: readonly LoggedExerciseRow[],
  exerciseKey: number,
  setKey: number,
  patch: Partial<Omit<PerformedSetRow, "key">>,
): LoggedExerciseRow[] {
  return rows.map((row) =>
    row.key === exerciseKey
      ? {
          ...row,
          performedSets: row.performedSets.map((set) =>
            set.key === setKey ? { ...set, ...patch } : set,
          ),
        }
      : row,
  );
}

// An exercise always keeps at least one performed-set row, so removing the last is a no-op.
export function removePerformedSet(
  rows: readonly LoggedExerciseRow[],
  exerciseKey: number,
  setKey: number,
): LoggedExerciseRow[] {
  return rows.map((row) =>
    row.key === exerciseKey && row.performedSets.length > 1
      ? { ...row, performedSets: row.performedSets.filter((set) => set.key !== setKey) }
      : row,
  );
}

// --- Storage-boundary validation: a stored draft is untrusted input.

function hasStringFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => isBoundedDraftString(value[field]));
}

function isPerformedSetRow(value: unknown): value is PerformedSetRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    isPositiveInteger(row.key) &&
    hasStringFields(row, [
      "reps", "distance", "duration", "loadKind", "loadValue", "perceivedDifficulty",
    ])
  );
}

export function isPlanExerciseRow(value: unknown): value is PlanExerciseRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    isPositiveInteger(row.key) &&
    isPositiveInteger(row.exerciseId) &&
    hasStringFields(row, [
      "exerciseName", "kind", "unit", "sets", "reps", "restSeconds", "tempo",
      "setType", "note", "targetEffortScale", "targetEffortValue", "loadKind", "loadValue",
    ]) &&
    ["repetitions", "distance", "duration"].includes(String(row.kind)) &&
    ["km", "mi"].includes(String(row.unit)) &&
    ["absolute", "bodyweight", "percent_1rm", "qualitative", "range"]
      .includes(String(row.loadKind)) &&
    KNOWN_EFFORT_SCALES.some((scale) => scale === row.targetEffortScale) &&
    (row.supersetGroup === null || typeof row.supersetGroup === "string") &&
    (row.roundRestSeconds === null ||
      (typeof row.roundRestSeconds === "number" &&
        Number.isInteger(row.roundRestSeconds) &&
        row.roundRestSeconds >= 0))
  );
}

function isLoggedExerciseRow(value: unknown): value is LoggedExerciseRow {
  if (!isPlanExerciseRow(value)) return false;
  const sets = (value as { performedSets?: unknown }).performedSets;
  return (
    Array.isArray(sets) &&
    sets.length > 0 &&
    sets.length <= MAX_DRAFT_ROWS &&
    hasUniqueKeys(sets as Array<{ key?: number }>) &&
    sets.every(isPerformedSetRow)
  );
}

function hasExerciseList(
  draft: Record<string, unknown>,
  isRow: (value: unknown) => boolean,
): draft is Record<string, unknown> & { exercises: unknown[] } {
  return (
    TRAINING_TYPES.some((type) => type === draft.trainingType) &&
    Array.isArray(draft.exercises) &&
    draft.exercises.length <= MAX_DRAFT_ROWS &&
    hasUniqueKeys(draft.exercises as Array<{ key?: number }>) &&
    draft.exercises.every(isRow)
  );
}

// A plan draft. Keys a plan draft never holds (a date, performed sets) are ignored, so a draft
// saved before the forms were split still restores.
export function isPlanDraft(value: unknown): value is PlanDraft {
  if (typeof value !== "object" || value === null) return false;
  return hasExerciseList(value as Record<string, unknown>, isPlanExerciseRow);
}

export function isLogDraft(value: unknown): value is LogDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    isDraftDate(draft.performedOn) &&
    isDraftUuid(draft.idempotencyKey) &&
    hasExerciseList(draft, isLoggedExerciseRow) &&
    (draft.exercises as LoggedExerciseRow[]).reduce(
      (count, exercise) => count + exercise.performedSets.length,
      0,
    ) <= MAX_DRAFT_ROWS
  );
}

// --- Rendering the list.

// A contiguous run of exercises to render together: a bordered Superset container wrapping its
// members, or a single solo exercise. Derived from the per-row Superset layout so the render
// brackets each group into one visible box (ADR-0023).
export type RenderRun =
  | { kind: "solo"; index: number }
  | { kind: "group"; group: string; indices: number[] };

export function renderRuns(layout: readonly SupersetSlot[]): RenderRun[] {
  const runs: RenderRun[] = [];
  let index = 0;
  while (index < layout.length) {
    const group = layout[index].group;
    if (group === null) {
      runs.push({ kind: "solo", index });
      index += 1;
      continue;
    }
    // Consume the whole contiguous group run (contiguity is an enforced invariant, so a
    // group's members always sit together).
    const indices: number[] = [];
    while (index < layout.length && layout[index].group === group) {
      indices.push(index);
      index += 1;
    }
    runs.push({ kind: "group", group, indices });
  }
  return runs;
}
