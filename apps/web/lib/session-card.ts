// View-model for the shared Session card (GLOSSARY: Recent Sessions, My Sessions, ADR-0134). Pure
// and browser-safe (no server-only imports), like `recent-sessions` and `session-library`, so it is
// unit-testable without a browser and both the Train panel and the My Sessions list feed it.
//
// Train's "Pick up again" panel and the My Sessions library render one card. Both hold the same row
// shape — a `GET /api/sessions` summary, which carries the plan's last performed date and its first
// exercise names — so there is one mapper and every line of the card renders on both surfaces.

import { formatLongDate } from "./date-format.ts";
import { sessionRowTitle, type SessionSummary } from "./session-library.ts";
import { GENERIC_AUTHOR_LABEL } from "./session-author.ts";
import {
  trainingTypeBadgeVariant,
  type TrainingTypeBadgeVariant,
} from "./training-type-badge.ts";

// The normalized props the presentational `SessionCard` renders.
export interface SessionCardModel {
  // The plan's stable id — the Workout Signature seed, so a plan wears the same mark everywhere.
  id: number;
  displayName: string;
  trainingType: string;
  // The type badge's colour, per Training Type.
  badgeVariant: TrainingTypeBadgeVariant;
  exerciseCount: number;
  startHref: string;
  // The Start control's accessible label — names the row so screen-reader users tell the repeated
  // Start controls apart.
  startLabel: string;
  // Where a tap anywhere on the card goes: the plan's detail page.
  detailHref: string;
  // "Last trained <date>" or "Not trained yet". A performed date is honest record data (History
  // shows it too), never the forbidden calendar "today" (ADR-0001).
  lastTrainedLabel: string;
  // The plan's first movements, ≤ 3 — a preview of what Start runs, drawn from the plan.
  previewExercises: string[];
  // The Author credit, already resolved to the never-blank label; `null` on a self-authored plan.
  authorName: string | null;
  // The read-time Logged Count: drives the "Trained N×" badge and gates row Delete.
  loggedCount: number;
}

// The card's "last trained" line from the plan's newest performed date (`YYYY-MM-DD`), or the
// never-performed copy when there is none.
export function lastTrainedLabel(lastPerformedOn: string | null): string {
  return lastPerformedOn === null
    ? "Not trained yet"
    : `Last trained ${formatLongDate(lastPerformedOn)}`;
}

// The card's "N exercises" fact.
export function exerciseCountLabel(count: number): string {
  return `${count} ${count === 1 ? "exercise" : "exercises"}`;
}

// Map a list row onto the card model.
export function sessionCardModel(summary: SessionSummary): SessionCardModel {
  const title = sessionRowTitle(summary);
  // The Author byline (GLOSSARY: Author) is provenance, not self-repetition: shown only when the
  // plan was authored by someone else (an adopted/shared copy). A self-authored row drops it.
  // Otherwise the never-blank credit (a null/blank raw name → the generic label).
  const authorName = summary.authored_by_me
    ? null
    : summary.author.display_name?.trim() || GENERIC_AUTHOR_LABEL;
  return {
    id: summary.id,
    displayName: title,
    trainingType: summary.training_type,
    badgeVariant: trainingTypeBadgeVariant(summary.training_type),
    exerciseCount: summary.exercise_count,
    startHref: `/sessions/${summary.id}/live`,
    startLabel: `Start ${title}`,
    detailHref: `/sessions/${summary.id}`,
    lastTrainedLabel: lastTrainedLabel(summary.last_performed_on),
    previewExercises: summary.preview_exercises,
    authorName,
    loggedCount: summary.logged_count,
  };
}

// Whether a library row offers Delete in its ⋯ menu (GLOSSARY: Delete, ADR-0063): only a plan that
// has never been performed (Logged Count 0). A performed Session is settled record and is never
// deleted from the row; the server 409 is the backstop on a race. Mirrors the mutually-exclusive
// rule the old inline control used (the "Trained N×" badge shows instead when the count is > 0).
export function canDeleteSessionRow(loggedCount: number): boolean {
  return loggedCount <= 0;
}

// The ⋯ menu's Favorite action label (GLOSSARY: Favorite): mark when currently unfavorited, unmark
// when currently favorited. Owned here so the menu item and the long-press shortcut read the same.
export function favoriteActionLabel(isFavorite: boolean): string {
  return isFavorite ? "Unfavorite session" : "Favorite session";
}

// The Favorite row's description in an action sheet (ADR-0113: every row says what it does). It
// names where the marker shows up, since Favorite exists to filter My Sessions.
export function favoriteActionDescription(isFavorite: boolean): string {
  return isFavorite
    ? "Take it out of Favorites in My Sessions"
    : "Show it under Favorites in My Sessions";
}
