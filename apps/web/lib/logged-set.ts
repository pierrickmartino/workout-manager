// The Logged Set write module (ADR-0115): the one place a performed-set row becomes the
// `LogSetInput` the record endpoints accept. ADR-0106 wrote the *field* once; this writes the
// *row → request* step once, so the plan-backed log, the ad-hoc log, Log Correction, the
// Hand-Authored Session and the Live Session finish all share one policy:
//
//   * a blank amount skips the row; a garbled amount is an error that rejects the whole
//     submission, so a typo is never silently dropped from the record;
//   * Effort is sent typed (ADR-0066) whenever one is present, and a record's own Effort —
//     RIR or half-step RPE — is re-sent unchanged unless its cell was edited;
//   * a non-blank Set Note rides as raw text (the backend escapes it, ADR-0065);
//   * a Load value is converted from the reader's Weight Unit to canonical kg (#417).
//
// The row is ADR-0106's `SetEntryValues` — raw strings, typed here at the write seam — plus the
// resolved Exercise id. Only two things legitimately differ between paths, and they are the two
// build options: whether the path has an explicit performed mark (so a blank rep count on a
// marked row logs as 0), and the Load kind a blank picker defaults to.
//
// Pure and browser-safe, so the policy is unit-tested here and every caller stays thin.

import { KNOWN_EFFORT_SCALES, type Effort } from "./effort.ts";
import { loadValueToKg, type LoadKind } from "./load.ts";
import type { LogSetInput } from "./logs-types";
import {
  distanceInput,
  durationInput,
  parseDurationSeconds,
  repetitionsInput,
  type DistanceUnit,
  type QuantityKind,
} from "./quantity.ts";
import {
  SET_ENTRY_FIELDS,
  setEntryValues,
  type SetEntryField,
  type SetEntryValues,
} from "./set-entry.ts";
import type { WeightUnit } from "./weight-unit";

// The upper bound on rows one submission is read for — a real record never comes close. The
// client sends the row count in a hidden field, so the reader clamps to this ceiling and a
// forged, absurdly large `set_count` costs a fixed amount of work.
const MAX_SET_ROWS = 500;

const DEFAULT_LOAD_KIND: LoadKind = "absolute";
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";
const QUANTITY_KINDS = new Set<string>(["repetitions", "distance", "duration"]);
const DISTANCE_UNITS = new Set<string>(["km", "mi"]);
const MIN_RPE = 1;
const MAX_RPE = 10;

// The hidden field a Log Correction row carries its record's typed Effort in. Not an entry
// field: nothing renders it, it only rides so the record's Effort survives the full replace.
export const CARRIED_EFFORT_FIELD = "carried_effort";

// A record's own Effort, carried through a correction. `shownAs` is the RPE text the form
// seeded the Effort cell with; while the cell still reads exactly that, the user has not
// touched it and the typed Effort — which the cell cannot express (RIR, a half-step) — is
// re-sent as it was.
export interface CarriedEffort {
  effort: Effort;
  shownAs: string;
}

// One row to build: the entry values as typed, the resolved catalog Exercise, and — on a
// correction only — the record's own Effort.
export interface LoggedSetRow {
  exerciseId: number;
  values: SetEntryValues;
  carriedEffort?: CarriedEffort | null;
}

// The two real differences between paths. Anything else that seems to need an option is a
// policy question to settle here, not a flag to add.
export interface LoggedSetOptions {
  // The path has an explicit performed mark (the plan-backed log's Done toggle, a completed
  // Live Session set), so a blank rep count on a marked row is 0 reps — a set ground out to
  // failure is still attempted (GLOSSARY 'Completion Outcome'). Elsewhere a blank row is one
  // the user did not perform.
  performedMark?: boolean;
  // The Load kind a blank picker means. `absolute` unless the path says otherwise.
  defaultLoadKind?: LoadKind;
}

export type LoggedSetsResult =
  | { ok: true; sets: LogSetInput[] }
  | { ok: false; error: string };

type QuantityFields = Pick<
  LogSetInput,
  "quantity_kind" | "quantity_value" | "quantity_unit" | "quantity_duration"
>;

type QuantityResult =
  | { status: "quantity"; fields: QuantityFields }
  | { status: "skip" }
  | { status: "error"; error: string };

function normalizeKind(kind: string): QuantityKind {
  return (QUANTITY_KINDS.has(kind) ? kind : "repetitions") as QuantityKind;
}

function normalizeUnit(unit: string): DistanceUnit {
  return (DISTANCE_UNITS.has(unit) ? unit : DEFAULT_DISTANCE_UNIT) as DistanceUnit;
}

function repetitionsQuantity(raw: string, performedMark: boolean): QuantityResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return performedMark
      ? { status: "quantity", fields: repetitionsInput(0) }
      : { status: "skip" };
  }
  const reps = Number(trimmed);
  if (!Number.isInteger(reps) || reps < 0) {
    return {
      status: "error",
      error: "Enter a whole number of reps (like 8) for each set you did.",
    };
  }
  return { status: "quantity", fields: repetitionsInput(reps) };
}

function distanceQuantity(values: SetEntryValues): QuantityResult {
  const raw = values.distance.trim();
  if (raw === "") return { status: "skip" };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      status: "error",
      error: "Enter a valid distance (like 5 or 3.1) for each distance set you did.",
    };
  }
  return {
    status: "quantity",
    fields: distanceInput(raw, normalizeUnit(values.unit), values.duration),
  };
}

function durationQuantity(raw: string): QuantityResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { status: "skip" };
  const seconds = parseDurationSeconds(trimmed);
  if (seconds === null || seconds <= 0) {
    return {
      status: "error",
      error: "Enter a valid hold time (like 45 or 1:30) for each duration set you did.",
    };
  }
  return { status: "quantity", fields: durationInput(trimmed) };
}

function quantityFor(values: SetEntryValues, performedMark: boolean): QuantityResult {
  switch (normalizeKind(values.kind)) {
    case "distance":
      return distanceQuantity(values);
    case "duration":
      return durationQuantity(values.duration);
    default:
      return repetitionsQuantity(values.reps, performedMark);
  }
}

// An in-range RPE from the Effort cell, or null when blank or out of range — the picker only
// offers 1–10 integers, so anything else is not a value the user chose.
function rpeFrom(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= MIN_RPE && value <= MAX_RPE ? value : null;
}

type EffortFields = Pick<
  LogSetInput,
  "perceived_difficulty" | "effort_scale" | "effort_value"
>;

// The Effort fields: the carried Effort while its cell is untouched, else the cell's RPE typed
// on the RPE scale (the backend mirrors it into `perceived_difficulty`), else none at all —
// an absent Effort, never a fabricated one.
function effortFields(row: LoggedSetRow): EffortFields {
  const rpe = rpeFrom(row.values.rpe);
  const carried = row.carriedEffort;
  if (carried && row.values.rpe.trim() === carried.shownAs) {
    return {
      perceived_difficulty: rpe,
      effort_scale: carried.effort.scale,
      effort_value: carried.effort.value,
    };
  }
  if (rpe === null) return { perceived_difficulty: null };
  return { perceived_difficulty: rpe, effort_scale: "rpe", effort_value: rpe };
}

function loadFields(
  values: SetEntryValues,
  unit: WeightUnit,
  defaultLoadKind: LoadKind,
): Pick<LogSetInput, "load_kind" | "load_value"> {
  const loadKind = (values.load_kind || defaultLoadKind) as LoadKind;
  const loadValue = loadValueToKg(loadKind, values.load_value.trim(), unit);
  return { load_kind: loadKind, load_value: loadValue === "" ? null : loadValue };
}

type LoggedSetResult =
  | { status: "set"; set: LogSetInput }
  | { status: "skip" }
  | { status: "error"; error: string };

function buildLoggedSet(
  row: LoggedSetRow,
  unit: WeightUnit,
  options: LoggedSetOptions,
): LoggedSetResult {
  if (!Number.isInteger(row.exerciseId)) return { status: "skip" };

  const quantity = quantityFor(row.values, options.performedMark ?? false);
  if (quantity.status !== "quantity") return quantity;

  const note = row.values.note.trim();
  return {
    status: "set",
    set: {
      exercise_id: row.exerciseId,
      ...quantity.fields,
      ...loadFields(row.values, unit, options.defaultLoadKind ?? DEFAULT_LOAD_KIND),
      ...effortFields(row),
      ...(note !== "" ? { note } : {}),
    },
  };
}

// Build every row into a Logged Set, or the first error. A skipped row is omitted; an error
// rejects the whole list so nothing partial is saved. An empty result is not an error here —
// what "nothing performed" means is the record's header rule, worded by each path.
export function buildLoggedSets(
  rows: readonly LoggedSetRow[],
  unit: WeightUnit,
  options: LoggedSetOptions = {},
): LoggedSetsResult {
  const sets: LogSetInput[] = [];
  for (const row of rows) {
    const result = buildLoggedSet(row, unit, options);
    if (result.status === "error") return { ok: false, error: result.error };
    if (result.status === "set") sets.push(result.set);
  }
  return { ok: true, sets };
}

// Whether a row carries an amount in the field its kind names — the test a path applies
// before doing work for a row (resolving a typed movement name) that would be dropped anyway.
export function hasAmount(values: SetEntryValues): boolean {
  switch (normalizeKind(values.kind)) {
    case "distance":
      return values.distance.trim() !== "";
    case "duration":
      return values.duration.trim() !== "";
    default:
      return values.reps.trim() !== "";
  }
}

// --- Reading a posted form. Every logging form posts `set-<i>-<field>` under a `set_count`
// header (ADR-0106). Beyond the entry fields a row may carry a hidden Exercise id, a performed
// mark, and a carried Effort; each path decides which rows it keeps from those.

export interface PostedSetRow {
  values: SetEntryValues;
  // The hidden `exercise_id`, or null when absent or not an integer.
  exerciseId: number | null;
  // The performed mark: true/false when the form posts one, null when it has none.
  done: boolean | null;
  carriedEffort: CarriedEffort | null;
}

function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function readExerciseId(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const id = Number(trimmed);
  return Number.isInteger(id) ? id : null;
}

function readDone(raw: string): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

// Encode a carried Effort for its hidden field.
export function carriedEffortValue(carried: CarriedEffort): string {
  return JSON.stringify({
    scale: carried.effort.scale,
    value: carried.effort.value,
    shownAs: carried.shownAs,
  });
}

// Decode a carried Effort, or null for anything that is not one. The field is client-posted,
// so a forged value is treated as absent; the backend still validates the Effort's band.
function readCarriedEffort(raw: string): CarriedEffort | null {
  if (raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { scale, value, shownAs } = parsed as Record<string, unknown>;
  const isKnownScale = (KNOWN_EFFORT_SCALES as readonly unknown[]).includes(scale);
  if (!isKnownScale || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (typeof shownAs !== "string") return null;
  return { effort: { scale: scale as Effort["scale"], value }, shownAs };
}

function readValues(form: FormData, index: number): SetEntryValues {
  const given: Partial<Record<SetEntryField, string>> = {};
  for (const field of SET_ENTRY_FIELDS) {
    given[field] = readField(form, `set-${index}-${field}`);
  }
  return setEntryValues(given);
}

// Read the posted rows in order, bounded by `MAX_SET_ROWS`. Nothing is dropped here: which
// rows count (a Done mark, a named movement, a hidden id) is the path's rule.
export function readPostedSetRows(form: FormData): PostedSetRow[] {
  const count = Number(readField(form, "set_count"));
  if (!Number.isInteger(count) || count <= 0) return [];

  const bounded = Math.min(count, MAX_SET_ROWS);
  return Array.from({ length: bounded }, (_, index) => ({
    values: readValues(form, index),
    exerciseId: readExerciseId(readField(form, `set-${index}-exercise_id`)),
    done: readDone(readField(form, `set-${index}-done`)),
    carriedEffort: readCarriedEffort(readField(form, `set-${index}-${CARRIED_EFFORT_FIELD}`)),
  }));
}
