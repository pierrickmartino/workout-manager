// View-model for the History screen's search + filter. This module has NO server-only
// imports, so both the Server Component page and the Client Component controls can use it.
//
// It works purely over the History index (client-side filtering, Q4; ADR-0128): one row per
// Logged Session, so a filter always sees the whole record even though full records arrive in
// windows. An exercise search matches the *record* — the movements its Logged Sets performed —
// never the plan (Q1), so a substituted-in or off-plan movement is found. A training-type
// filter reads each Logged Session's own denormalized `training_type` (ADR-0031, Q3). The two facets intersect
// (AND); multiple training types OR within their own facet (Q7).

import type { HistoryIndexRow } from "./logs-types";
import { TRAINING_TYPES } from "./sessions-types.ts";
import { daysInMonth } from "./month-arithmetic.ts";

// The URL param names the filter state lives under (Q8): a single `exercise`, and a repeated
// `type` for each selected Training Type.
const EXERCISE_PARAM = "exercise";
const TYPE_PARAM = "type";
// The Month view's address (ADR-0138): `view=month`, plus an optional `month=YYYY-MM` and,
// inside it, an optional `day=YYYY-MM-DD`.
const VIEW_PARAM = "view";
const MONTH_PARAM = "month";
const DAY_PARAM = "day";

const KNOWN_TYPES: ReadonlySet<string> = new Set(TRAINING_TYPES);

// A plain calendar month, `YYYY-MM` with a real month number. Never a `Date`: a month is a
// calendar value, not an instant (ADR-0096).
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// A plain calendar day, `YYYY-MM-DD`; whether the day exists in its month is checked apart.
const ISO_DAY = /^(\d{4}-(?:0[1-9]|1[0-2]))-(\d{2})$/;

// The two ways History lays out the record: the newest-first List, or Month view (one month
// of it). List is the default, so a URL without `view` is the screen as it always was.
export type HistoryView = "list" | "month";

// The facets that narrow which Logged Sessions match. `exercise` is one exact catalog movement
// name (Q2/Q6) or null for "no exercise constraint". `trainingTypes` is the selected subset of
// the curated Training Type set (Q6); empty means "no type constraint" (all types).
export interface HistoryFacets {
  exercise: string | null;
  trainingTypes: string[];
}

// Everything History's URL carries: the facets, the view, and — in Month view only — the
// month on screen (`YYYY-MM`) and the selected day in it (`YYYY-MM-DD`). A null month in Month
// view means "the newest matching month"; a null day means "the whole month".
export interface HistoryFilters extends HistoryFacets {
  view: HistoryView;
  month: string | null;
  day: string | null;
}

// The distinct exercises the user has actually logged, alphabetical — the options for the
// exercise picker (Q5). Only movements present in the record are offered, since searching for
// one you never performed can only ever yield an empty result.
export function deriveExerciseOptions(
  records: readonly Pick<HistoryIndexRow, "exercise_names">[],
): string[] {
  const names = new Set<string>();
  for (const record of records) {
    for (const name of record.exercise_names) {
      names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// The fields a filter reads off a History index row.
type Filterable = Pick<HistoryIndexRow, "training_type" | "exercise_names">;

// Whether a record performed the named exercise — i.e. any of its Logged Sets references it.
// Exact-name match is sound because the Catalog holds one definition per normalized name.
function performedExercise(record: Filterable, exercise: string): boolean {
  return record.exercise_names.includes(exercise);
}

// Apply the agreed filter, returning a new array (immutability) in the input order. An unset
// facet imposes no constraint; a set exercise AND a non-empty training-type set both apply.
export function filterHistory<T extends Filterable>(
  records: readonly T[],
  filters: HistoryFacets,
): T[] {
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
// The view and month are not facets: Month view with no exercise or type is unfiltered.
export function hasActiveFilters(filters: HistoryFacets): boolean {
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

  // Only `view=month` selects Month view; anything else is the default List. A month is read
  // only in Month view, and only when it is a real `YYYY-MM` (ADR-0138).
  const view: HistoryView = params.get(VIEW_PARAM) === "month" ? "month" : "list";
  const rawMonth = params.get(MONTH_PARAM) ?? "";
  const month = view === "month" && ISO_MONTH.test(rawMonth) ? rawMonth : null;
  const day = month === null ? null : dayInMonth(params.get(DAY_PARAM) ?? "", month);

  return { exercise, trainingTypes, view, month, day };
}

// The day, when it is a real calendar day of `month`; otherwise null. A day is only ever read
// inside the month it names, so a malformed or out-of-month day is dropped, not trusted.
function dayInMonth(rawDay: string, month: string): string | null {
  const match = ISO_DAY.exec(rawDay);
  if (match === null || match[1] !== month) return null;
  const day = Number(match[2]);
  return day >= 1 && day <= daysInMonth(month) ? rawDay : null;
}

// Serialize filter state back into a query string for router navigation (Q8) — the inverse of
// `parseHistoryFilters`. Unset facets contribute nothing, so a cleared filter yields "". The
// List view is the default and writes no `view`; a month is written only in Month view, and a
// day only with its month.
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
  if (filters.view === "month") {
    params.set(VIEW_PARAM, "month");
    if (filters.month !== null) {
      params.set(MONTH_PARAM, filters.month);
      if (filters.day !== null) {
        params.set(DAY_PARAM, filters.day);
      }
    }
  }
  return params;
}
