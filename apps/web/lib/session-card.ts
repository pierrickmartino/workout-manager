// View-model for the shared Session card (CONTEXT: Recent Sessions, My Sessions). Pure and
// browser-safe (no server-only imports), like `recent-sessions` and `session-library`, so it is
// unit-testable without a browser and both the Train panel and the My Sessions list feed it.
//
// The Train page renders each of the user's most-recently-performed plans in one card format; My
// Sessions reuses that exact format for its library rows. Rather than two card components that can
// drift, both call-sites map their own row shape into this one `SessionCardModel` and render the
// single presentational `SessionCard`. The two sources carry different fields — Train has a
// "Last trained" date and an exercise preview but no author/menu; the library has an author, a
// Logged Count and a ⋯ actions menu but no performed date — so every source-specific field on the
// model is nullable and the card renders each line only when present.

import type { RecentSessionRow } from "./recent-sessions.ts";
import { sessionRowTitle, type SessionSummary } from "./session-library.ts";
import { GENERIC_AUTHOR_LABEL } from "./session-author.ts";
import {
  trainingTypeBadgeVariant,
  type TrainingTypeBadgeVariant,
} from "./training-type-badge.ts";

// The normalized props the presentational `SessionCard` renders. The always-present fields drive
// the sigil, title, type badge and Start; the nullable ones are the source-specific lines.
export interface SessionCardModel {
  // The plan's stable id — the Workout Signature seed, so a plan wears the same mark everywhere.
  id: number;
  displayName: string;
  trainingType: string;
  // The type badge's colour. Train keeps its fixed `cyan`; the library colours per Training Type
  // (the map it already used), so neither surface's badge changes when they adopt one card.
  badgeVariant: TrainingTypeBadgeVariant;
  exerciseCount: number;
  startHref: string;
  // The Start control's accessible label — names the row so screen-reader users tell the repeated
  // Start controls apart.
  startLabel: string;
  // When set, the sigil/title/badge block links to the plan's detail page (the library); Train
  // leaves it null so its title is not a link.
  detailHref: string | null;
  // The most-recent performed date (Train only). Honest record data (History shows it too), never
  // the forbidden calendar "today" (ADR-0001).
  lastPerformedOn: string | null;
  // The plan's first movements, ≤ 3 (Train only) — a preview of what Start runs.
  previewExercises: string[];
  // The Author credit (library only), already resolved to the never-blank label.
  authorName: string | null;
  // The read-time Logged Count (library only): drives the "Trained N×" badge and gates row Delete.
  // `null` means the surface carries no Logged Count (Train), so no fact row renders.
  loggedCount: number | null;
}

// Map a Train "Recent Sessions" row onto the shared card model. Train keeps its fixed cyan badge,
// its performed date and exercise preview, and has no author, Logged Count or actions menu.
export function recentSessionCardModel(row: RecentSessionRow): SessionCardModel {
  return {
    id: row.id,
    displayName: row.displayName,
    trainingType: row.trainingType,
    badgeVariant: "cyan",
    exerciseCount: row.exerciseCount,
    startHref: row.startHref,
    startLabel: `Start ${row.displayName}`,
    detailHref: null,
    lastPerformedOn: row.lastPerformedOn,
    previewExercises: row.previewExercises,
    authorName: null,
    loggedCount: null,
  };
}

// Map a My Sessions library row onto the shared card model. The library colours the badge per
// Training Type, links the title to the detail page, credits the Author and carries the Logged
// Count; it has no performed date or exercise preview (those aren't on the list payload — Q3).
export function sessionSummaryCardModel(
  summary: SessionSummary,
): SessionCardModel {
  const title = sessionRowTitle(summary);
  // The Author byline (CONTEXT: Author) is provenance, not self-repetition: shown only when the
  // plan was authored by someone else (an adopted/shared copy). A self-authored row drops it
  // (`null` → the card renders no byline). Otherwise the never-blank credit — the same fallback
  // the row used before (a null/blank raw name → the generic label), so a shown byline is never "".
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
    lastPerformedOn: null,
    previewExercises: [],
    authorName,
    loggedCount: summary.logged_count,
  };
}

// Whether a library row offers Delete in its ⋯ menu (CONTEXT: Delete, ADR-0063): only a plan that
// has never been performed (Logged Count 0). A performed Session is settled record and is never
// deleted from the row; the server 409 is the backstop on a race. Mirrors the mutually-exclusive
// rule the old inline control used (the "Trained N×" badge shows instead when the count is > 0).
export function canDeleteSessionRow(loggedCount: number): boolean {
  return loggedCount <= 0;
}

// The ⋯ menu's Favorite action label (CONTEXT: Favorite): mark when currently unfavorited, unmark
// when currently favorited. Owned here so the menu item and the long-press shortcut read the same.
export function favoriteActionLabel(isFavorite: boolean): string {
  return isFavorite ? "Unfavorite session" : "Favorite session";
}
