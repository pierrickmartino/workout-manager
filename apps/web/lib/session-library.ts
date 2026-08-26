// View-model for the My Sessions library screen's search + favorites filter (issue #397).
// This module has NO server-only imports, so both the Server Component page and the Client
// Component controls can use it.
//
// It works purely over the already-fetched library (client-side filtering, like
// `history-filter`). Search matches the Session Name, the derived fallback label
// (`training_type · date`), and the Training Type case-insensitively; the favorites-only
// flag narrows to the owner's Favorites; the two combine (AND). The fallback-label
// derivation mirrors the server's `session_label` (apps/api/app/domain/session_naming.py)
// so client-side search has parity with the `GET /api/sessions` filter.

// The separator joining Training Type and creation date in the derived fallback label.
// Mirrors the server's `_LABEL_SEPARATOR` so the two derived labels are byte-identical.
const LABEL_SEPARATOR = " · ";

// One row of the My Sessions library, as returned by `GET /api/sessions`. `name` is the raw
// user-given Session Name (`null` when unnamed); `display_name` is the server-resolved
// never-blank label (the name, else the fallback) the row renders. `created_at` is the
// creation *date* (`YYYY-MM-DD`) — the exact string the fallback label embeds, so search
// can reproduce the fallback with parity. `author.display_name` is the raw Author credit
// (`null` when unset; the `sessionAuthorView` mapper resolves the generic label).
export interface SessionSummary {
  id: number;
  training_type: string;
  name: string | null;
  display_name: string;
  created_at: string;
  author: { display_name?: string | null };
  is_favorite: boolean;
}

// The active My Sessions filters: a free-text `query` (blank means "no search constraint")
// and the `favoritesOnly` toggle.
export interface SessionLibraryFilters {
  query: string;
  favoritesOnly: boolean;
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

// Apply the agreed filter, returning a new array (immutability) in the input order. The
// favorites flag and the search combine (AND): a Session survives only when it is favorited
// (if the flag is set) and matches the search.
export function filterSessions(
  summaries: SessionSummary[],
  filters: SessionLibraryFilters,
): SessionSummary[] {
  return summaries.filter((summary) => {
    if (filters.favoritesOnly && !summary.is_favorite) {
      return false;
    }
    return matchesSessionSearch(summary, filters.query);
  });
}

// Whether any filter is active — drives the filtered-count badge and the "clear" affordance.
export function hasActiveSessionFilters(filters: SessionLibraryFilters): boolean {
  return filters.query.trim().length > 0 || filters.favoritesOnly;
}
