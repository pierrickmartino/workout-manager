// The Capture seed view-model (ADR-0044): fold a plan-less Logged Session (a record) into
// the pre-fill for the Hand-Authored Session builder, so Capture opens the builder already
// carrying what the user actually did. Pure and browser-safe (no server-only imports), so
// the lossy record→plan fold is unit-tested here rather than re-derived inside the page or
// the component.
//
// The fold is deliberately faithful and never fabricates: a contiguous run of the same
// Exercise becomes one prescription; its `sets` is that run's length; the plan target is
// the *performed* range (or the representative amount for a hold/run); the recommended Load
// is the run's heaviest performed set. Rest, tempo, and Supersets are left blank — the
// record never captured them, so they are for the user to fill in the builder, not invented
// here. Distinct from `correctionFieldsFromRecord`, which reverses a record into its own
// *edit* fields; this reverses a record into a new *plan*'s seed.

import {
  distanceUnitFromText,
  type DistanceUnit,
  type QuantityKind,
} from "./quantity.ts";
import { loadToFields, type Load, type LoadKind } from "./load.ts";
import type { WeightUnit } from "./weight-unit";
import type { LoggedSession, LoggedSet } from "./logs-types";

const DEFAULT_AMOUNT_KIND: QuantityKind = "repetitions";
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

// One seeded exercise for the builder — the plan half only, since Capture authors a plan.
// The fields mirror an exercise row's plan inputs; `reps` is the free-text plan target for
// the kind (a rep range, a hold time, or a distance), and `loadKind`/`loadValue` feed the
// same typed-Load picker the builder uses.
export interface CaptureSeedExercise {
  exerciseId: number;
  exerciseName: string;
  kind: QuantityKind;
  unit: DistanceUnit;
  sets: string;
  reps: string;
  loadKind: LoadKind;
  loadValue: string;
}

// The whole builder seed derived from a record: the record's training type and one seeded
// exercise per contiguous same-Exercise run of its sets.
export interface CaptureSeed {
  trainingType: string;
  exercises: CaptureSeedExercise[];
}

// A contiguous run of logged sets that all record the same Exercise. Order is preserved, so
// an A, B, A workout yields two separate A runs (two prescriptions) rather than merging
// them and misrepresenting the sequence.
function contiguousRuns(sets: LoggedSet[]): LoggedSet[][] {
  const runs: LoggedSet[][] = [];
  for (const set of sets) {
    const last = runs[runs.length - 1];
    if (last && last[0].exercise_id === set.exercise_id) {
      last.push(set);
    } else {
      runs.push([set]);
    }
  }
  return runs;
}

// The plan target for a run, worded for its Amount kind. Repetitions collapse to the
// performed range (`"6-8"`, or a single value when uniform); a hold or a run takes the
// representative (first) set's display text verbatim (`"0:45"`, `"5 km"`). A run with no
// readable amount seeds a blank target for the user to fill.
function targetFor(kind: QuantityKind, run: LoggedSet[]): string {
  if (kind === "repetitions") {
    const counts = run
      .map((set) => (set.quantity?.kind === "repetitions" ? set.quantity.count : undefined))
      .filter((count): count is number => typeof count === "number");
    if (counts.length === 0) return "";
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    return min === max ? String(min) : `${min}-${max}`;
  }
  return run[0]?.quantity?.text ?? "";
}

// A single comparable "how heavy" number for a performed Load, used only to pick the run's
// heaviest set. Comparability is within one Exercise, so a bodyweight set ranks by its
// *added* load and a percent set by its percentage; qualitative and load-less sets have no
// number and never win. Never surfaced — only compared.
function weightKey(load: Load | null): number {
  if (load === null) return Number.NEGATIVE_INFINITY;
  switch (load.kind) {
    case "absolute":
      return load.kg ?? Number.NEGATIVE_INFINITY;
    case "range":
      return load.high_kg ?? Number.NEGATIVE_INFINITY;
    case "bodyweight":
      return load.added_kg ?? 0;
    case "percent_1rm":
      return load.percent ?? Number.NEGATIVE_INFINITY;
    default:
      return Number.NEGATIVE_INFINITY;
  }
}

// The heaviest performed Load in a run (ties resolve to the first), or the first set's Load
// when none is comparable — so a bodyweight-only or qualitative run still seeds its Load
// rather than dropping it.
function heaviestLoad(run: LoggedSet[]): Load | null {
  let best = run[0] ?? null;
  for (const set of run) {
    if (weightKey(set.load) > weightKey(best?.load ?? null)) best = set;
  }
  return best?.load ?? null;
}

function seedExercise(run: LoggedSet[], weightUnit: WeightUnit): CaptureSeedExercise {
  const first = run[0];
  const kind: QuantityKind = first.quantity?.kind ?? DEFAULT_AMOUNT_KIND;
  const unit =
    kind === "distance"
      ? distanceUnitFromText(first.quantity?.text)
      : DEFAULT_DISTANCE_UNIT;
  // The heaviest performed Load is reversed into the picker's fields by the shared
  // `loadToFields` (lib/load.ts) — the same reverse-map the correction pre-fill uses — in the
  // reader's Weight Unit, so the builder shows what they'd type; the build step converts the
  // entry back to kilograms on save (#417).
  return {
    exerciseId: first.exercise_id,
    exerciseName: first.exercise_name,
    kind,
    unit,
    sets: String(run.length),
    reps: targetFor(kind, run),
    ...loadToFields(heaviestLoad(run), weightUnit),
  };
}

// Build the builder seed from a plan-less record (ADR-0044): its training type plus one
// seeded exercise per contiguous same-Exercise run of its logged sets. The source record is
// never read for anything but its performed contents — Capture spawns a plan alongside it,
// never converts it.
export function captureSeedFromRecord(
  record: LoggedSession,
  unit: WeightUnit,
): CaptureSeed {
  return {
    trainingType: record.training_type,
    exercises: contiguousRuns(record.logged_sets).map((run) =>
      seedExercise(run, unit),
    ),
  };
}
