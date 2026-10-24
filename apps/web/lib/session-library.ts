// View-model for the My Sessions library screen (issue #397). This module has NO
// server-only imports, so both the Server Component page and the Client Component controls
// can use it.
//
// It works purely over the already-fetched library (client-side filtering, like
// `history-filter`). Four facets combine (AND), picked from a facet rail (ADR-0141): a free-text
// `query`, the owner's Favorites, any number of Training Types (OR within the facet) and one
// Exercise the plan prescribes. Search matches the Session Name, the derived fallback label (`training_type · date`), and the Training Type
// case-insensitively; the fallback-label derivation mirrors the server's `session_label`
// (apps/api/app/domain/session_naming.py) so client-side search has parity with the
// `GET /api/sessions` filter. The row's display title and date-format live here too, so the
// component stays a thin renderer.

import { formatLongDate } from "./date-format.ts";

// The separator joining Training Type and creation date in the derived fallback label.
// Mirrors the server's `_LABEL_SEPARATOR` so the two derived labels are byte-identical.
const LABEL_SEPARATOR = " · ";

// The curated Training Type order the type facet renders in — mirroring `TRAINING_TYPES` in
// `sessions-types.ts` (the fixed five). Kept local rather than value-imported so this pure,
// browser-safe view-model stays free of runtime sibling imports (the repo's convention for
// unit-tested view-models). Drift is graceful: a type outside this list is still shown, just
// appended after the curated ones rather than placed among them.
const CURATED_TYPE_ORDER: readonly string[] = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
];

// One row of the My Sessions library, as returned by `GET /api/sessions`. `name` is the raw
// user-given Session Name (`null` when unnamed); `display_name` is the server-resolved
// never-blank label (the name, else the fallback) used for search parity. `created_at` is the
// creation *date* (`YYYY-MM-DD`) — the string the fallback label embeds and the row renders as
// the plan's date. `author.display_name` is the raw Author credit (`null` when unset; the
// `sessionAuthorView` mapper resolves the generic label). `exercise_count` is the plan's
// Exercise Prescription count (the "N exercises" fact); `logged_count` is the read-time Logged
// Count (performances) — the "Trained N×" fact and the Delete guard.
export interface SessionSummary {
  id: number;
  training_type: string;
  name: string | null;
  display_name: string;
  created_at: string;
  author: { display_name?: string | null };
  // Whether the Author resolves to the viewing owner (GLOSSARY: Author). The card surfaces the "by
  // <name>" byline only when this is false — it is provenance (a plan adopted from someone else),
  // not self-repetition on every row. Computed server-side (owner == author); always present on a
  // list row.
  authored_by_me: boolean;
  is_favorite: boolean;
  exercise_count: number;
  // Logged Count (GLOSSARY: Logged Count, ADR-0063): how many Logged Sessions the owner has
  // recorded against this Session. The row badges it when > 0 (so already-trained Sessions are
  // spotted at a glance) and offers Delete only when it is 0 (a performed Session is never
  // deleted). Always present on a list row — the server computes it for every row.
  logged_count: number;
  // The plan's newest performed date (`YYYY-MM-DD`), or `null` when never performed — a
  // read-time projection over the record, the shared Session card's "Last trained" line.
  last_performed_on: string | null;
  // The plan's first (≤ 3) Exercise names in prescription order — the card's preview of what
  // Start runs, drawn from the plan, never the last record.
  preview_exercises: string[];
  // Every distinct Exercise name the plan prescribes, alphabetical — what the Exercise facet
  // matches and counts over (ADR-0141). The plan, never the record.
  exercise_names: string[];
}

// The active My Sessions facets (ADR-0141), combined with AND. `query` is free text (blank
// means "no search constraint"); `favorite` narrows to the owner's Favorites; `trainingTypes`
// is the selected subset of the library's types, OR'd together (empty means all types);
// `exercise` is one exact Exercise name the plan prescribes, or null.
export interface SessionLibraryFilters {
  query: string;
  favorite: boolean;
  trainingTypes: string[];
  exercise: string | null;
}

// Every facet off — the whole library.
export const EMPTY_SESSION_FILTERS: SessionLibraryFilters = {
  query: "",
  favorite: false,
  trainingTypes: [],
  exercise: null,
};

// The Training Types the type facet offers: only those actually present in the library (no dead
// "Yoga" row in a strength-only library), ordered by the curated `TRAINING_TYPES` order.
// A stored type outside the curated set still earns a row — appended in first-seen order —
// so a row is never unreachable by its own type.
export function availableTrainingTypes(
  summaries: readonly Pick<SessionSummary, "training_type">[],
): string[] {
  const present = new Set(summaries.map((summary) => summary.training_type));
  const chips = CURATED_TYPE_ORDER.filter((type) => present.has(type));
  const seen = new Set(chips);
  for (const summary of summaries) {
    if (!seen.has(summary.training_type)) {
      chips.push(summary.training_type);
      seen.add(summary.training_type);
    }
  }
  return chips;
}

// The derived fallback label for a Session — `training_type · date` — mirroring the fallback
// branch of the server's `session_label`. `createdAt` is already the calendar date string,
// so this is a pure format with no date parsing (and thus no timezone drift from the server).
export function sessionFallbackLabel(
  trainingType: string,
  createdAt: string,
): string {
  return `${trainingType}${LABEL_SEPARATOR}${createdAt}`;
}

// Whether a Session matches the search `query`. A blank/whitespace-only query matches every
// Session. Otherwise the trimmed, lower-cased query is a substring test against the Training
// Type, the always-derivable fallback label (so a named Session is still found by its date),
// and the raw Session Name when set — the same three haystacks as the server predicate.
export function matchesSessionSearch(
  summary: Pick<SessionSummary, "training_type" | "created_at" | "name">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }

  const haystacks = [
    summary.training_type,
    sessionFallbackLabel(summary.training_type, summary.created_at),
  ];
  const name = summary.name?.trim() ?? "";
  if (name.length > 0) {
    haystacks.push(name);
  }

  return haystacks.some((haystack) => haystack.toLowerCase().includes(needle));
}

// The fields a filter reads off a library row.
export type SessionFilterable = Pick<
  SessionSummary,
  "training_type" | "created_at" | "name" | "is_favorite" | "exercise_names"
>;

// Apply the agreed filter, returning a new array (immutability) in the input order. An unset
// facet imposes no constraint; every set facet must hold (AND).
export function filterSessions<T extends SessionFilterable>(
  summaries: readonly T[],
  filters: SessionLibraryFilters,
): T[] {
  const { favorite, trainingTypes, exercise, query } = filters;
  return summaries.filter(
    (summary) =>
      (!favorite || summary.is_favorite) &&
      (trainingTypes.length === 0 || trainingTypes.includes(summary.training_type)) &&
      (exercise === null || summary.exercise_names.includes(exercise)) &&
      matchesSessionSearch(summary, query),
  );
}

// Whether any facet is active — drives the filtered-count badge and the "clear" affordance.
// A whitespace-only query narrows nothing, so it does not count.
export function hasActiveSessionFilters(
  filters: SessionLibraryFilters,
): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.favorite ||
    filters.trainingTypes.length > 0 ||
    filters.exercise !== null
  );
}

// The URL param names the facets round-trip under, mirrored into the URL with
// `replaceFilterQuery` (ADR-0100) so a refreshed or shared link restores the same narrowed
// view. Free text lives under `query` (matching the catalog's param); the other three use
// History's shape (ADR-0141): `favorite=1`, a repeated `type`, and one `exercise`.
const SESSION_QUERY_PARAM = "query";
const FAVORITE_PARAM = "favorite";
const FAVORITE_ON = "1";
const TYPE_PARAM = "type";
const EXERCISE_PARAM = "exercise";
// The pre-rail single-select chip (`chip=favorites` / `chip=type:<t>`), read only so an old
// bookmark still opens its view; never written.
const LEGACY_CHIP_PARAM = "chip";
const LEGACY_FAVORITES_CHIP = "favorites";
const LEGACY_TYPE_CHIP_PREFIX = "type:";

// The facets a pre-rail `chip` value names. The query string is untrusted input: an
// unrecognised keyword, or a `type:` prefix with no value, names nothing.
function legacyChipFacets(
  raw: string | null,
): Pick<SessionLibraryFilters, "favorite" | "trainingTypes"> {
  if (raw === LEGACY_FAVORITES_CHIP) {
    return { favorite: true, trainingTypes: [] };
  }
  const trainingType = raw?.startsWith(LEGACY_TYPE_CHIP_PREFIX)
    ? raw.slice(LEGACY_TYPE_CHIP_PREFIX.length).trim()
    : "";
  return { favorite: false, trainingTypes: trainingType.length > 0 ? [trainingType] : [] };
}

// The selected types, trimmed and de-duplicated, blanks dropped. Deliberately NO validation
// against a fixed set — the type facet is derived from the library itself
// (`availableTrainingTypes` keeps types outside the curated five), so a shared link to such a
// type must survive.
function parseTrainingTypes(values: readonly string[]): string[] {
  const types = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return [...new Set(types)];
}

// Read the filter state out of the URL — the inverse of `sessionFiltersToQuery`. A blank or
// absent value turns its facet off, so a bare URL is the unfiltered view. The legacy `chip` is
// read only when neither `favorite` nor `type` is present.
export function parseSessionFilters(
  params: URLSearchParams,
): SessionLibraryFilters {
  const query = params.get(SESSION_QUERY_PARAM)?.trim() ?? "";
  const rawExercise = params.get(EXERCISE_PARAM)?.trim() ?? "";
  const exercise = rawExercise.length > 0 ? rawExercise : null;
  if (!params.has(FAVORITE_PARAM) && !params.has(TYPE_PARAM)) {
    return { query, exercise, ...legacyChipFacets(params.get(LEGACY_CHIP_PARAM)) };
  }
  return {
    query,
    favorite: params.get(FAVORITE_PARAM) === FAVORITE_ON,
    trainingTypes: parseTrainingTypes(params.getAll(TYPE_PARAM)),
    exercise,
  };
}

// Serialize filter state back into a query string for `replaceFilterQuery` — the inverse of
// `parseSessionFilters`. Unset facets contribute nothing, so a cleared filter yields "".
export function sessionFiltersToQuery(
  filters: SessionLibraryFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query.length > 0) {
    params.set(SESSION_QUERY_PARAM, query);
  }
  if (filters.favorite) {
    params.set(FAVORITE_PARAM, FAVORITE_ON);
  }
  for (const type of filters.trainingTypes) {
    params.append(TYPE_PARAM, type);
  }
  if (filters.exercise !== null) {
    params.set(EXERCISE_PARAM, filters.exercise);
  }
  return params;
}

// Format the plan's creation date (a `YYYY-MM-DD` calendar string) as e.g. "Sep 5, 2026" —
// the shared calendar-date label (`date-format`), so every surface spells a date one way.
export function formatSessionDate(createdAt: string): string {
  return formatLongDate(createdAt);
}

// The row's display title (GLOSSARY: My Sessions / Session Name): the user-given Session Name
// when set, else the formatted creation date. Unlike the server's `display_name` fallback
// (`training_type · date`), an unnamed row's title drops the Training Type — it is already
// carried by the row's type badge, so repeating it would double-print (Q5).
export function sessionRowTitle(summary: SessionSummary): string {
  const name = summary.name?.trim();
  if (name) {
    return name;
  }
  return formatSessionDate(summary.created_at);
}
