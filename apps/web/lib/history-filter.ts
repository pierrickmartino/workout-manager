// View-model for the History screen's search + filter. This module has NO server-only
// imports, so both the Server Component page and the Client Component controls can use it.
//
// It works purely over the already-fetched History feed (client-side filtering, Q4). An
// exercise search matches the *record* — each Logged Session's Logged Sets — never the plan
// (Q1), so a substituted-in or off-plan movement is found. A training-type filter reads each
// Logged Session's own denormalized `training_type` (ADR-0031, Q3). The two facets intersect
// (AND); multiple training types OR within their own facet (Q7).

import type { LoggedSession } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";

// The URL param names the filter state lives under (Q8): a single `exercise`, and a repeated
// `type` for each selected Training Type.
const EXERCISE_PARAM = "exercise";
const TYPE_PARAM = "type";

const KNOWN_TYPES: ReadonlySet<string> = new Set(TRAINING_TYPES);

// The active History filters. `exercise` is one exact catalog movement name (Q2/Q6) or null
// for "no exercise constraint". `trainingTypes` is the selected subset of the curated
// Training Type set (Q6); empty means "no type constraint" (all types).
export interface HistoryFilters {
  exercise: string | null;
  trainingTypes: string[];
}

// The distinct exercises the user has actually logged, alphabetical — the options for the
// exercise picker (Q5). Only movements present in the record are offered, since searching for
// one you never performed can only ever yield an empty result.
export function deriveExerciseOptions(records: LoggedSession[]): string[] {
  const names = new Set<string>();
  for (const record of records) {
    for (const set of record.logged_sets) {
      names.add(set.exercise_name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// Whether a record performed the named exercise — i.e. any of its Logged Sets references it.
// Exact-name match is sound because the Catalog holds one definition per normalized name.
function performedExercise(record: LoggedSession, exercise: string): boolean {
  return record.logged_sets.some((set) => set.exercise_name === exercise);
}

// Apply the agreed filter, returning a new array (immutability) in the input order. An unset
// facet imposes no constraint; a set exercise AND a non-empty training-type set both apply.
export function filterHistory(
  records: LoggedSession[],
  filters: HistoryFilters,
): LoggedSession[] {
  const { exercise, trainingTypes } = filters;
  return records.filter((record) => {
    if (exercise !== null && !performedExercise(record, exercise)) {
      return false;
    }
    if (
      trainingTypes.length > 0 &&
      !trainingTypes.includes(record.training_type)
    ) {
      return false;
    }
    return true;
  });
}

// Whether any facet is active — drives the "3 of 24" filtered count vs the plain "24" (Q9).
export function hasActiveFilters(filters: HistoryFilters): boolean {
  return filters.exercise !== null || filters.trainingTypes.length > 0;
}

// Read the filter state out of the URL (Q8). The query string is untrusted input, so an
// unknown training type is dropped rather than trusted, repeats are de-duplicated, and a
// blank exercise collapses to "no exercise".
export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
  const rawExercise = params.get(EXERCISE_PARAM)?.trim() ?? "";
  const exercise = rawExercise.length > 0 ? rawExercise : null;

  const seen = new Set<string>();
  const trainingTypes: string[] = [];
  for (const value of params.getAll(TYPE_PARAM)) {
    if (KNOWN_TYPES.has(value) && !seen.has(value)) {
      seen.add(value);
      trainingTypes.push(value);
    }
  }

  return { exercise, trainingTypes };
}

// Serialize filter state back into a query string for router navigation (Q8) — the inverse of
// `parseHistoryFilters`. Unset facets contribute nothing, so a cleared filter yields "".
export function historyFiltersToQuery(
  filters: HistoryFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.exercise !== null && filters.exercise.length > 0) {
    params.set(EXERCISE_PARAM, filters.exercise);
  }
  for (const type of filters.trainingTypes) {
    params.append(TYPE_PARAM, type);
  }
  return params;
}
