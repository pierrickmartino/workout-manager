// View-model for the My Sessions library screen (issue #397). This module has NO
// server-only imports, so both the Server Component page and the Client Component controls
// can use it.
//
// It works purely over the already-fetched library (client-side filtering, like
// `history-filter`). Two filter dimensions combine (AND): a free-text `query` and a
// single-select `chip` (All / Favorites / one Training Type). Search matches the Session
// Name, the derived fallback label (`training_type · date`), and the Training Type
// case-insensitively; the fallback-label derivation mirrors the server's `session_label`
// (apps/api/app/domain/session_naming.py) so client-side search has parity with the
// `GET /api/sessions` filter. The row's display title and date-format live here too, so the
// component stays a thin renderer.

// The separator joining Training Type and creation date in the derived fallback label.
// Mirrors the server's `_LABEL_SEPARATOR` so the two derived labels are byte-identical.
const LABEL_SEPARATOR = " · ";

// The curated Training Type order the type chips render in — mirroring `TRAINING_TYPES` in
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
  is_favorite: boolean;
  exercise_count: number;
  // Logged Count (CONTEXT: Logged Count, ADR-0063): how many Logged Sessions the owner has
  // recorded against this Session. The row badges it when > 0 (so already-trained Sessions are
  // spotted at a glance) and offers Delete only when it is 0 (a performed Session is never
  // deleted). Always present on a list row — the server computes it for every row.
  logged_count: number;
}

// The single-select chip filter (CONTEXT: My Sessions): `all` (no narrowing), `favorites`
// (the owner's Favorites), or one `type` (a Training Type). Folds the former standalone
// favorites toggle into one row alongside the per-type chips.
export type SessionChipFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "type"; trainingType: string };

// The active My Sessions filters: a free-text `query` (blank means "no search constraint")
// and the single-select `chip`. The two combine (AND).
export interface SessionLibraryFilters {
  query: string;
  chip: SessionChipFilter;
}

// The default (unfiltered) chip — the "All" scope.
export const ALL_SESSIONS_CHIP: SessionChipFilter = { kind: "all" };

// Whether two chip selections are the same filter — so the chip row can mark the active one
// and toggling the active type chip back to All is a plain equality check.
export function isSameChip(a: SessionChipFilter, b: SessionChipFilter): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "type" && b.kind === "type") {
    return a.trainingType === b.trainingType;
  }
  return true;
}

// The Training Types that get a chip: only those actually present in the library (no dead
// "Yoga" chip in a strength-only library), ordered by the curated `TRAINING_TYPES` order.
// A stored type outside the curated set still earns a chip — appended in first-seen order —
// so a row is never unreachable by its own type.
export function availableTypeChips(summaries: SessionSummary[]): string[] {
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
  summary: SessionSummary,
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

// Whether a Session survives the chip selection: `all` keeps everything, `favorites` keeps the
// owner's Favorites, `type` keeps that one Training Type.
function matchesChip(summary: SessionSummary, chip: SessionChipFilter): boolean {
  switch (chip.kind) {
    case "all":
      return true;
    case "favorites":
      return summary.is_favorite;
    case "type":
      return summary.training_type === chip.trainingType;
  }
}

// Apply the agreed filter, returning a new array (immutability) in the input order. The chip
// and the search combine (AND): a Session survives only when it matches the active chip *and*
// the search.
export function filterSessions(
  summaries: SessionSummary[],
  filters: SessionLibraryFilters,
): SessionSummary[] {
  return summaries.filter(
    (summary) =>
      matchesChip(summary, filters.chip) &&
      matchesSessionSearch(summary, filters.query),
  );
}

// Whether any filter is active — drives the filtered-count badge and the "clear" affordance.
// A non-blank query or any chip other than "All" counts as active.
export function hasActiveSessionFilters(
  filters: SessionLibraryFilters,
): boolean {
  return filters.query.trim().length > 0 || filters.chip.kind !== "all";
}

// The three-letter month abbreviations for the row date, indexed by 0-based month.
const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Format the plan's creation date (a `YYYY-MM-DD` calendar string) as e.g. "Sep 5, 2026".
// Parsed by regex, never `new Date`, so it is timezone-agnostic — the server already sent the
// calendar date and this only reshapes it. A string that isn't a plain date is returned as-is.
export function formatSessionDate(createdAt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(createdAt);
  if (match === null) {
    return createdAt;
  }
  const [, year, month, day] = match;
  const abbreviation = MONTH_ABBREVIATIONS[Number(month) - 1];
  if (abbreviation === undefined) {
    return createdAt;
  }
  return `${abbreviation} ${Number(day)}, ${year}`;
}

// The row's display title (CONTEXT: My Sessions / Session Name): the user-given Session Name
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
