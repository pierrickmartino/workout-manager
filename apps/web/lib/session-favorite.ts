import type { WorkoutSession } from "./sessions-types";

// The Session view's Favorite state (CONTEXT: Favorite, issue #396). `isFavorite` is the
// current marker — the toggle renders "Favorited" vs. "Favorite" from it. `show` gates whether
// the toggle appears at all: Favorite is a standalone-only concept, so the server withholds the
// marker (`null`) on a Protocol member and omits it entirely on read paths that don't carry it
// (live hydration); the toggle is hidden in both cases, mirroring how Rename/Duplicate are
// withheld inside a Protocol.
export interface SessionFavoriteView {
  isFavorite: boolean;
  show: boolean;
}

// Map a Session onto its Favorite view. Pure and server-free (types are erased), so the
// show/hide decision is unit-testable without a browser or the transport seam.
//
// The marker is a real boolean only on a standalone Session read; a withheld (`null`) or absent
// marker means "not favoritable here", so the toggle is hidden and `isFavorite` reads false.
export function sessionFavoriteView(session: WorkoutSession): SessionFavoriteView {
  const show = typeof session.is_favorite === "boolean";
  return { isFavorite: session.is_favorite === true, show };
}
