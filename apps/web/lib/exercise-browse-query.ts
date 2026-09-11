// Pure query-string helpers for the Browse-the-Catalog surface (ADR-0042). No server or
// React imports, so this is unit-testable with `node --test` and reusable from both the
// server page (parsing the incoming URL) and the data-access seam (building the request).

import type { CatalogFilters } from "./exercise-browse-types";

// A Next.js `searchParams` bag: each key is absent, a single string, or repeated.
export type RawSearchParams = Record<string, string | string[] | undefined>;

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// The facet params (no pagination) as a `URLSearchParams`, so a deep link like
// `/exercises?muscle_group=Legs&equipment=barbell` round-trips. A blank query is omitted
// rather than sent as an empty param.
export function catalogFiltersToParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query) params.set("query", query);
  for (const group of filters.muscleGroups) params.append("muscle_group", group);
  for (const item of filters.equipment) params.append("equipment", item);
  for (const band of filters.difficulty) params.append("difficulty", band);
  return params;
}

// The full backend request query for one page: the facet params plus `limit`/`offset`.
// The single place the browse request URL is assembled, so the data-access module keeps
// only the path.
export function buildCatalogQuery(
  filters: CatalogFilters,
  page: { limit: number; offset: number },
): string {
  const params = catalogFiltersToParams(filters);
  params.set("limit", String(page.limit));
  params.set("offset", String(page.offset));
  return params.toString();
}

// Parse an incoming Next `searchParams` bag into `CatalogFilters`, so a shared/deep link
// lands on the same filtered view. Unknown facet values pass through untouched — the
// backend drops the ones it does not recognize (ADR-0042).
export function parseCatalogFilters(raw: RawSearchParams): CatalogFilters {
  return {
    query: typeof raw.query === "string" ? raw.query : "",
    muscleGroups: asArray(raw.muscle_group),
    equipment: asArray(raw.equipment),
    difficulty: asArray(raw.difficulty),
  };
}

// Toggle `value` in a multi-select facet list immutably: remove it if present, append it
// if absent. The one mutation rule behind every facet chip, kept pure so it is trivially
// testable and never mutates the caller's array.
export function toggleFacetValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((existing) => existing !== value)
    : [...values, value];
}

// Whether any facet or the name query is active — drives the empty-state "Clear filters"
// affordance and the "showing the whole Catalog" copy.
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.muscleGroups.length > 0 ||
    filters.equipment.length > 0 ||
    filters.difficulty.length > 0
  );
}
